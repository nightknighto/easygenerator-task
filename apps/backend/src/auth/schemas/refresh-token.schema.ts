import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/**
 * DB-backed refresh token (sha256 of the opaque cookie value). Rows rotate on
 * every refresh; `revokedAt` on a presented token means reuse → revoke all
 * rows of that user. `expiresAt` carries a TTL index for auto-purge.
 */
@Schema({ collection: 'refresh_tokens' })
export class RefreshToken {
  @Prop({ required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  tokenHash!: string;

  @Prop({ required: true })
  rememberMe!: boolean;

  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt!: Date | null;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);
