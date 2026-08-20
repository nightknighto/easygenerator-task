import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { generateToken, hashToken } from '../common/crypto/tokens';
import {
  REFRESH_TTL_LONG_SECONDS,
  REFRESH_TTL_SHORT_SECONDS,
} from './auth.constants';
import {
  RefreshToken,
  RefreshTokenDocument,
} from './schemas/refresh-token.schema';

@Injectable()
export class RefreshTokenService {
  constructor(
    @InjectModel(RefreshToken.name)
    private readonly model: Model<RefreshTokenDocument>,
  ) {}

  /** Issues a new refresh token row; TTL policy follows `rememberMe`. */
  async issue(
    userId: Types.ObjectId,
    rememberMe: boolean,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = generateToken();
    const ttlSeconds = rememberMe
      ? REFRESH_TTL_LONG_SECONDS
      : REFRESH_TTL_SHORT_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.model.create({
      userId,
      tokenHash: hashToken(token),
      rememberMe,
      expiresAt,
      revokedAt: null,
    });
    return { token, expiresAt };
  }

  findByToken(token: string): Promise<RefreshTokenDocument | null> {
    return this.model.findOne({ tokenHash: hashToken(token) }).exec();
  }

  /**
   * Atomically revokes the row backing `token` (only if still live).
   * Returns the revoked row or null when it was already revoked.
   */
  async revoke(token: string): Promise<RefreshTokenDocument | null> {
    return this.model
      .findOneAndUpdate(
        { tokenHash: hashToken(token), revokedAt: null },
        { $set: { revokedAt: new Date() } },
        { new: true },
      )
      .exec();
  }

  /** Reuse canary: kills every session of the user. */
  revokeAllForUser(userId: Types.ObjectId): Promise<unknown> {
    return this.model
      .updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      )
      .exec();
  }
}
