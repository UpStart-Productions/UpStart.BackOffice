import { Injectable } from '@nestjs/common';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
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

  async createUserForEmail(email: string): Promise<{ sent: boolean; message: string }> {
    if (!this.client || !this.userPoolId) {
      return {
        sent: false,
        message: 'Cognito is not configured. Set COGNITO_REGION and COGNITO_USER_POOL_ID.',
      };
    }

    const trimmed = email?.trim();
    if (!trimmed) {
      return { sent: false, message: 'Email is required.' };
    }

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
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
      return {
        sent: true,
        message:
          'Invitation sent. They can sign in with this email and the temporary password from the email, then set a new password.',
      };
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        return this.resendInviteForExistingUser(trimmed);
      }
      throw err;
    }
  }

  private async resendInviteForExistingUser(email: string): Promise<{ sent: boolean; message: string }> {
    if (!this.client || !this.userPoolId) {
      return { sent: false, message: 'Cognito is not configured.' };
    }

    try {
      await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
          MessageAction: 'RESEND',
        }),
      );
      return {
        sent: true,
        message: 'New temporary password sent.',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('status is not FORCE_CHANGE_PASSWORD')) {
        return {
          sent: false,
          message: 'User already has a password. They can sign in or use "Forgot password?" to reset it.',
        };
      }
      throw err;
    }
  }
}
