// Import dependencies
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import path from 'path';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import logger, { morganStream } from '../core/logger.js';
import createError from 'http-errors';
import fs from 'fs';
import compression from 'compression';
import multer from 'multer';
import { enduranceEmitter, enduranceEventTypes } from '../core/emitter.js';
import { enduranceSwagger } from '../infra/swagger.js';
import { fileURLToPath } from 'url';
import { setupDistributedEmitter } from '../core/distributedEmitter.js';

class EnduranceApp {
  public app: express.Application;
  private port: number | string;
  private swaggerApiFiles: string[] = [];
  private __dirname: string;
  private isDirectUsage: boolean = false;
  private upload: multer.Multer;

  constructor() {
    const __filename = fileURLToPath(import.meta.url);
    this.__dirname = path.dirname(__filename);
    this.app = express();
    this.port = process.env.SERVER_PORT || 3000; // Default port is 3000 if PORT env variable is not set

    // Configuration de multer pour les uploads de fichiers
    const storage = multer.diskStorage({
      destination: (req: Request, file: any, cb: (error: Error | null, destination: string) => void) => {
        // Trouver le chemin du projet parent (celui qui utilise endurance-core)
        const nodeModulesPath = this.__dirname.split('node_modules')[0];
        const projectRoot = path.dirname(nodeModulesPath);
        const uploadDir = path.join(projectRoot, 'uploads');

        // Créer le dossier s'il n'existe pas
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        logger.info('Upload directory:', uploadDir);
        cb(null, uploadDir);
      },
      filename: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => {
        // Garder le nom original du fichier
        const originalName = path.parse(file.originalname).name;
        const ext = path.extname(file.originalname);
        // Ajouter un suffixe unique à la fin
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `${originalName}-${uniqueSuffix}${ext}`;
        logger.info('Saving file:', filename);
        cb(null, filename);
      }
    });

    this.upload = multer({
      storage,
      limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE || '5242880') // 5MB par défaut
      }
    });

    const nmPath = path.join('node_modules', '@programisto', 'endurance-core', 'dist', 'internal');
    const currentFilePath = fileURLToPath(import.meta.url);
    const isDirect = currentFilePath.replace(/\\/g, '/').includes(`/${nmPath}`);
    this.isDirectUsage = isDirect;

    // Initialiser l'application Express dans tous les cas
    this.app.set('port', this.port);
    this.setupMiddlewares();
    this.setupCors();
    this.setupLogging();
    this.setupRoutes().then(() => {
      this.setupErrorHandling();
      this.setupDatabase();
    });
  }

  private setupMiddlewares() {
    const payloadLimit = process.env.REQUEST_PAYLOAD_LIMIT || '50mb';

    // Middleware pour gérer différemment les requêtes multipart/form-data et JSON
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        next();
      } else {
        express.json({ limit: payloadLimit })(req, res, next);
      }
    });

    // On garde les autres middlewares
    this.app.use(express.urlencoded({ extended: false, limit: payloadLimit }));
    this.app.use(cookieParser());
    this.app.use(compression());
  }

  private setupCors() {
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
      const corsOptions: cors.CorsOptions = {
        origin: (origin, callback) => {
          if (!origin || corsOrigin === '*' || corsOrigin.split(',').includes(origin)) {
            callback(null, true); // Authorized
          } else {
            callback(new Error('CORS unauthorized')); // Rejected
          }
        },
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true
      };
      this.app.use(cors(corsOptions));
      this.app.options('*', cors(corsOptions));
    }
  }

  private setupLogging() {
    this.app.use(morgan('combined', { stream: morganStream }));
  }

  private async setupRoutes() {
    const extractVersion = (filename: string): string | null => {
      const match = filename.match(/v?(\d+\.\d+\.\d+|\d+)/);
      return match ? match[1] : null;
    };

    const loadRoutes = async (basePath: string, filePath: string, version: string | null) => {
      try {
        const { default: router } = await import('file:///' + filePath);
        const versionedPath = version ? `/v${version}${basePath}` : basePath;
        this.app.use(versionedPath, router.getRouter());
        this.swaggerApiFiles.push(filePath);
      } catch (err) {
        logger.error(`❌ Error loading routes from ${filePath}:`);
        if (err instanceof AggregateError) {
            for (const e of err.errors) {
                logger.error(e.stack || e.message || e);
              console.error('Error details:', e);

            }
        } else {
            if (typeof err === 'object' && err !== null && ('stack' in err || 'message' in err)) {
              logger.error((err as { stack?: string; message?: string }).stack || (err as { message?: string }).message || err);
              console.error('Error details:', err);

            } else {
              logger.error(err);
              console.error('Error details:', err);
            }
        }
      }
    };

    const loadServer = async () => {
      const isDirectory = (filePath: string): boolean => fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();

      const endsWith = (filePath: string, suffix: string): boolean => filePath.endsWith(suffix);
      const routesMap = new Map<string, Map<string, string>>();

      const processFile = async (folderPath: string, file: string) => {
        const filePath = path.join(folderPath, file);

        if (isDirectory(filePath)) {
          await readModulesFolder(filePath, filePath);
        } else if (endsWith(folderPath, 'public')) {
          this.app.use(express.static(folderPath));
        } else if (
          (endsWith(file, '.listener.js') && endsWith(folderPath, 'listeners')) ||
          (endsWith(file, '.consumer.js') && endsWith(folderPath, 'consumers')) ||
          (endsWith(file, '.middleware.js') && endsWith(folderPath, 'middlewares')) ||
          (endsWith(file, '.cron.js') && endsWith(folderPath, 'crons'))
        ) {
          try {
            await import('file:///' + filePath);
          } catch (err) {
            logger.error(`Error loading file ${filePath}:`, err);
          }
        } else if (endsWith(file, '.router.js') && endsWith(folderPath, 'routes')) {
          const routerName = path.basename(file, '.router.js');
          const version = extractVersion(routerName);
          const basePath = `/${routerName.replace(`.${version}`, '')}`;

          if (!routesMap.has(basePath)) {
            routesMap.set(basePath, new Map());
          }
          routesMap.get(basePath)!.set(version || 'default', filePath);
        }
      };

      const readModulesFolder = async (folderPath: string, overridePath: string) => {
        try {
          fs.readdirSync(folderPath).forEach(async (file) => {
            const filePath = path.join(folderPath, file);

            try {
              if (isDirectory(filePath)) {
                await readModulesFolder(filePath, overridePath);
              } else {
                if (overridePath && overridePath !== '' && fs.existsSync(path.join(overridePath, file))) {
                  await processFile(overridePath, file);
                } else {
                  await processFile(folderPath, file);
                }
              }
            } catch (err) {
              logger.error(`Error processing file ${file}:`, err);
            }
          });
        } catch (err) {
          logger.error('Error reading directory:', err);
        }
      };

      const loadMarketplaceModules = async () => {
        const nodeModulesPath = path.join(process.cwd(), 'node_modules');
        const localModulesPath = path.join(process.cwd(), 'modules');

        const isDirectory = (filePath: string) => fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();

        try {
          const moduleEntries: { name: string; path: string }[] = [];

          // Modules à la racine de node_modules
          const rootModules = fs.readdirSync(nodeModulesPath);
          for (const moduleName of rootModules) {
            const fullPath = path.join(nodeModulesPath, moduleName);
            if (moduleName.startsWith('edrm-') && isDirectory(fullPath)) {
              moduleEntries.push({ name: moduleName, path: fullPath });
            }

            // Modules scoped, ex: @xxx/edrm-*
            if (moduleName.startsWith('@') && isDirectory(fullPath)) {
              const scopedPackages = fs.readdirSync(fullPath);
              for (const pkg of scopedPackages) {
                if (pkg.startsWith('edrm-')) {
                  const scopedPath = path.join(fullPath, pkg);
                  if (isDirectory(scopedPath)) {
                    moduleEntries.push({ name: `${moduleName}/${pkg}`, path: scopedPath });
                  }
                }
              }
            }
          }

          // Charger chaque module
          for (const moduleEntry of moduleEntries) {
            logger.info('Loading EDRM module:', moduleEntry.name);
            const distPath = path.join(moduleEntry.path, 'dist');

            // Pour @xxx/edrm-abc → path.join(..., '@xxx', 'edrm-abc')
            const localModulePath = path.join(localModulesPath, ...moduleEntry.name.split('/'));

            if (isDirectory(distPath)) {
              logger.info('Loading from dist directory:', distPath);
              await readModulesFolder(distPath, localModulePath);
            } else if (isDirectory(moduleEntry.path)) {
              logger.info('Loading from standard directory:', moduleEntry.path);
              await readModulesFolder(moduleEntry.path, localModulePath);
            } else {
              logger.warn(`Module ${moduleEntry.name} has no usable folder (dist or base).`);
            }
          }
        } catch (err) {
          logger.error('Error reading node_modules:', err);
        }
      };

      // Load the marketplace modules
      await loadMarketplaceModules();
      // Load modules from the local modules folder
      let modulesFolder = path.join(process.cwd(), 'dist/modules');

      if (isDirectory(modulesFolder)) {
        await readModulesFolder(modulesFolder, '');
      } else {
        modulesFolder = path.join(process.cwd(), 'src/modules');
        await readModulesFolder(modulesFolder, '');
      }

      for (const [basePath, versionsMap] of routesMap) {
        const sortedVersions = Array.from(versionsMap.keys()).sort((a, b) => {
          if (a === 'default') return -1;
          if (b === 'default') return 1;
          return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        for (let index = 0; index < sortedVersions.length; index++) {
          const version = sortedVersions[index];
          if (version === 'default') {
            await loadRoutes(basePath, versionsMap.get(version)!, null);
          } else {
            await loadRoutes(basePath, versionsMap.get(version)!, version);
          }

          if (index > 0) {
            const previousVersion = sortedVersions[index - 1];
            const fallbackPath = `/v${version}${basePath}`;
            const previousPath = `/v${previousVersion}${basePath}`;

            this.app.use(fallbackPath, (req: Request, res: Response, next: NextFunction) => {
              req.url = previousPath + req.url;
              next();
            });
          }
        }
      }

      this.app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.originalUrl === '/favicon.ico') {
          res.status(204).end(); // No Content
        } else {
          next();
        }
      });

      const enableSwagger = process.env.SWAGGER !== 'false';
      if (enableSwagger) {
        const swaggerSpec = enduranceSwagger.generateSwaggerSpec(this.swaggerApiFiles);
        await enduranceSwagger.setupSwagger(this.app, swaggerSpec);
      }

      if (process.env.NODE_ENV !== 'production') {
        this.app.get('/cause-error', (req: Request, res: Response) => {
          const error = new Error('Intentional error');
          (error as any).status = 500;
          res.status(500).json({ message: error.message });
        });
      }
    };

    await loadServer();
  }

  private setupErrorHandling() {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      next(createError(404));
    });

    this.app.use((err: any, req: Request, res: Response) => {
      res.locals.message = err.message;
      res.locals.error = req.app.get('env') === 'development' ? err : {};

      res.status(err.status || 500);
      res.render('error');
    });
  }

  private setupDatabase() {
    if (process.env.MONGODB_HOST) {
      import('../infra/database.js').then(({ enduranceDatabase }) => {
        this.app.use(
          session({
            secret: process.env.SESSION_SECRET || 'endurance',
            resave: false,
            saveUninitialized: false,
            store: enduranceDatabase.createStore()
          })
        );

        enduranceDatabase.connect()
          .then(({ conn }) => {
            const db = conn.db;
            if (!db) {
              logger.warn('[endurance-core] MongoDB connection established, but no database instance found.');
              return;
            }
            setupDistributedEmitter(conn.db);

            // Ne démarrer le serveur que si le module est utilisé directement
            if (this.isDirectUsage) {
              this.startServer();
            }
          })
          .catch((err: Error) => {
            logger.error('Error connecting to MongoDB', err);
          });
      });
    } else {
      this.app.use(
        session({
          secret: process.env.SESSION_SECRET || 'endurance',
          resave: false,
          saveUninitialized: false,
          store: new session.MemoryStore()
        })
      );
      // Ne démarrer le serveur que si le module est utilisé directement
      if (this.isDirectUsage) {
        this.startServer();
      }
    }
  }

  private startServer() {
    logger.info(`
      ______           _                                
     |  ____|         | |                               
     | |__   _ __   __| |_   _ _ __ __ _ _ __   ___ ___ 
     |  __| | '_ \\ / _\` | | | | '__/ _\` | '_ \\ / __/ _ \\
     | |____| | | | (_| | |_| | | | (_| | | | | (_|  __/
     |______|_| |_|\\__,_|\\__,_|_|  \\__,_|_| |_|\\___\\___|
                                                        
                                                        
    `);
    this.app.listen(this.port, () => {
      logger.info(`Server listening on port ${this.port}`);
      enduranceEmitter.emit(enduranceEventTypes.APP_STARTED);
    });
  }

  // Méthode publique pour accéder à l'instance de multer
  public getUpload() {
    return this.upload;
  }
}

export default new EnduranceApp().app;
