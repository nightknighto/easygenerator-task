import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { generateToken, hashToken } from '../common/crypto/tokens';
import {
  SignupToken,
  SignupTokenDocument,
} from './schemas/signup-token.schema';

@Injectable()
export class SignupTokenService {
  constructor(
    @InjectModel(SignupToken.name)
    private readonly model: Model<SignupTokenDocument>,
  ) {}

  /**
   * Invalidates any previous active token for the email (one active token per
   * address) and issues a fresh single-use token. Returns the raw token —
   * only its hash is persisted.
   */
  async issue(
    email: string,
    ttlMs: number,
  ): Promise<{ token: string; expiresAt: Date }> {
    await this.model.deleteMany({ email, consumedAt: null }).exec();
    const token = generateToken();
    const expiresAt = new Date(Date.now() + ttlMs);
    await this.model.create({
      email,
      tokenHash: hashToken(token),
      expiresAt,
      consumedAt: null,
    });
    return { token, expiresAt };
  }

  findByToken(token: string): Promise<SignupTokenDocument | null> {
    return this.model.findOne({ tokenHash: hashToken(token) }).exec();
  }

  /**
   * Atomically consumes the token (only if still active and unexpired).
   * Returns the consumed row, or null when another consumption won the race,
   * the token was already consumed, or it has expired.
   */
  async consume(token: string): Promise<SignupTokenDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          tokenHash: hashToken(token),
          consumedAt: null,
          expiresAt: { $gt: new Date() },
        },
        { $set: { consumedAt: new Date() } },
        { new: true },
      )
      .exec();
  }
}
