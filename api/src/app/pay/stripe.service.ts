import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { isStripeConfigured } from './pay.util';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client: Stripe | null = null;

  isConfigured(): boolean {
    return isStripeConfigured();
  }

  publishableKey(): string | null {
    return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || null;
  }

  getClient(): Stripe {
    if (this.client) return this.client;
    const key = process.env.STRIPE_SECRET_KEY?.trim();
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    this.client = new Stripe(key);
    return this.client;
  }

  constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }
    return this.getClient().webhooks.constructEvent(rawBody, signature, secret);
  }

  async createEmbeddedCheckout(params: {
    title: string;
    amountCents: number;
    currency: string;
    customerEmail?: string | null;
    metadata: Record<string, string>;
    integrationIdentifier: string;
  }): Promise<Stripe.Checkout.Session> {
    const stripe = this.getClient();
    return stripe.checkout.sessions.create({
      ui_mode: 'embedded_page',
      mode: 'payment',
      redirect_on_completion: 'never',
      customer_email: params.customerEmail || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency,
            unit_amount: params.amountCents,
            product_data: { name: params.title },
          },
        },
      ],
      metadata: params.metadata,
      client_reference_id: params.metadata.payableId,
      integration_identifier: params.integrationIdentifier,
    });
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.getClient().checkout.sessions.retrieve(sessionId);
  }

  async refundPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.getClient().refunds.create({ payment_intent: paymentIntentId });
    } catch (err) {
      this.logger.error(`Failed to refund PaymentIntent ${paymentIntentId}: ${String(err)}`);
      throw err;
    }
  }
}
