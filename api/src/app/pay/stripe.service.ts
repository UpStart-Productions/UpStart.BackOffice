import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { currentTenantId } from '../tenancy/tenant-context';
import { StripeIntegrationService } from './stripe-integration.service';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly clients = new Map<string, Stripe>();

  constructor(private readonly integration: StripeIntegrationService) {}

  isConfigured(): Promise<boolean> {
    return this.integration.isConfigured();
  }

  publishableKey(): Promise<string | null> {
    return this.integration.publishableKey();
  }

  clearClientCache(tenantId?: string): void {
    this.clients.delete(tenantId ?? currentTenantId());
  }

  private async getClient(): Promise<Stripe> {
    const tenantId = currentTenantId();
    const cached = this.clients.get(tenantId);
    if (cached) return cached;
    const key = await this.integration.getSecretKey(tenantId);
    const client = new Stripe(key);
    this.clients.set(tenantId, client);
    return client;
  }

  async constructWebhookEvent(rawBody: Buffer, signature: string): Promise<Stripe.Event> {
    const secret = await this.integration.getWebhookSecret();
    const stripe = await this.getClient();
    return stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  async createEmbeddedCheckout(params: {
    title: string;
    amountCents: number;
    currency: string;
    customerEmail?: string | null;
    metadata: Record<string, string>;
    integrationIdentifier: string;
  }): Promise<Stripe.Checkout.Session> {
    const stripe = await this.getClient();
    return stripe.checkout.sessions.create({
      ui_mode: 'embedded' as Stripe.Checkout.SessionCreateParams.UiMode,
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
    } as Stripe.Checkout.SessionCreateParams);
  }

  async retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return (await this.getClient()).checkout.sessions.retrieve(sessionId);
  }

  async getReceiptDetails(sessionId: string): Promise<{
    payerEmail: string | null;
    payerName: string | null;
    receiptNumber: string | null;
    receiptUrl: string | null;
  }> {
    const stripe = await this.getClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent.latest_charge'],
    });
    let charge = this.chargeFromExpandedSession(session);
    if (!charge) {
      const intentId =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (intentId) {
        const charges = await stripe.charges.list({ payment_intent: intentId, limit: 1 });
        charge = charges.data[0] ?? null;
      }
    }
    return {
      payerEmail: session.customer_details?.email?.trim() || session.customer_email?.trim() || null,
      payerName: session.customer_details?.name?.trim() || null,
      receiptNumber: charge?.receipt_number?.trim() || null,
      receiptUrl: charge?.receipt_url || null,
    };
  }

  private chargeFromExpandedSession(session: Stripe.Checkout.Session): Stripe.Charge | null {
    const intent = session.payment_intent;
    if (!intent || typeof intent === 'string') return null;
    const charge = intent.latest_charge;
    return charge && typeof charge !== 'string' ? charge : null;
  }

  async refundPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await (await this.getClient()).refunds.create({ payment_intent: paymentIntentId });
    } catch (err) {
      this.logger.error(`Failed to refund PaymentIntent ${paymentIntentId}: ${String(err)}`);
      throw err;
    }
  }
}