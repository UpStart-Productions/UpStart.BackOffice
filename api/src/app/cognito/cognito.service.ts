import { Injectable } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  InvalidPasswordException,
  UserNotFoundException,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';

@Injectable()
export class CognitoService {
  private readonly client: CognitoIdentityProviderClient | null = null;
  private readonly userPoolId: string | null = null;

  constructor() {
    const region = process.env.COGNITO_REGION;
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    if (region && userPoolId) {
      this.userPoolId = userPoolId;
      this.client = new CognitoIdentityProviderClient({ region });
    }
  }

  get isConfigured(): boolean {
    return this.client !== null && this.userPoolId !== null;
  }

  /**
   * True when this email already has a working login: a Cognito user that has set its own password
   * (status CONFIRMED). False when there is no such user, or they were created but never set one.
   * Null when Cognito isn't configured or can't be reached, so the caller can fall back.
   */
  async hasPassword(email: string): Promise<boolean | null> {
    if (!this.client || !this.userPoolId) return null;
    try {
      const res = await this.client.send(
        new AdminGetUserCommand({ UserPoolId: this.userPoolId, Username: email.trim() }),
      );
      return res.UserStatus === 'CONFIRMED';
    } catch (err) {
      if (err instanceof UserNotFoundException) return false;
      return null;
    }
  }

  /**
   * Create the Cognito user WITHOUT Cognito's own invitation email (MessageAction SUPPRESS).
   * Used by Task Manager sharing, which sends its own branded invite with a set-password link.
   * No-op if the user already exists.
   */
  async createUserSilently(email: string): Promise<void> {
    if (!this.client || !this.userPoolId) return;
    const trimmed = email.trim();
    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: trimmed,
          UserAttributes: [
            { Name: 'email', Value: trimmed },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'preferred_username', Value: trimmed },
          ],
          MessageAction: 'SUPPRESS',
        }),
      );
    } catch (err) {
      if (err instanceof UsernameExistsException) return;
      throw err;
    }
  }

  /**
   * Set a permanent password (invite acceptance). Creates the Cognito user first if needed.
   * Throws InvalidPasswordException with Cognito's policy message when the password is too weak.
   */
  async setPermanentPassword(email: string, password: string): Promise<void> {
    if (!this.client || !this.userPoolId) return;
    await this.createUserSilently(email);
    await this.client.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: this.userPoolId,
        Username: email.trim(),
        Password: password,
        Permanent: true,
      }),
    );
  }

  static isPasswordPolicyError(err: unknown): err is Error {
    return err instanceof InvalidPasswordException;
  }
}
