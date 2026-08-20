import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Single-use email signup token. Only the sha256 hash of the opaque token is
 * stored; `expiresAt` carries a TTL index so Mongo purges stale rows.
 */
@Schema({ collection: 'signup_tokens' })
export class SignupToken {
  @Prop({ required: true, index: true })
  email!: string;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  consumedAt!: Date | null;
}

export type SignupTokenDocument = HydratedDocument<SignupToken>;
export const SignupTokenSchema = SchemaFactory.createForClass(SignupToken);
