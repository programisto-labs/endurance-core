import * as Typegoose from '@typegoose/typegoose';
import { Types } from 'mongoose';
import { enduranceEmitter } from '../core/emitter.js';

export type EnduranceDocumentType<T> = Typegoose.DocumentType<T>;
export type ObjectId = Types.ObjectId;
export type Ref<T> = Typegoose.Ref<T>;

export const EnduranceModelType = {
    prop: Typegoose.prop,
    pre: Typegoose.pre,
    post: Typegoose.post,
    modelOptions: Typegoose.modelOptions,
    getModelForClass: Typegoose.getModelForClass,
    Severity: Typegoose.Severity,
    defaultClasses: Typegoose.defaultClasses,
    plugin: Typegoose.plugin,
    index: Typegoose.index,
    types: Typegoose.types
};

@EnduranceModelType.pre('save', function (this: any) {
    enduranceEmitter.emit(`${this.constructor.name}:preSave`, this);
})
@EnduranceModelType.modelOptions({ schemaOptions: { timestamps: true } })
export abstract class EnduranceSchema {
    private static _model: any;

    public static getModel(): any {
        if (!this._model) {
            this._model = Typegoose.getModelForClass(this as any);
        }
        return this._model;
    }

    // Injectées dynamiquement par Typegoose/Mongoose
    public save!: () => Promise<this>;
    public populate!: (...args: any[]) => any;
    public updateOne!: (...args: any[]) => any;
    public remove!: (...args: any[]) => any;
}

export type EnduranceModel<T extends new (...args: any[]) => any> =
    ReturnType<typeof Typegoose.getModelForClass<T>>;
