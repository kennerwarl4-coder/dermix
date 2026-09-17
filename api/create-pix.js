// Serverless function (Vercel) — cria uma cobranca Pix via SigiloPay.
// As chaves ficam SO aqui no servidor (variaveis de ambiente da Vercel), nunca no front-end.
//
// Configurar na Vercel: Project Settings > Environment Variables
//   SIGILOPAY_PUBLIC_KEY = <sua chave publica>
//   SIGILOPAY_SECRET_KEY = <sua chave secreta>
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (ver lib/kv.js)

import { kvSet } from '../lib/kv.js';

const KIT_PRICE = 137.90;
const PIX_DISCOUNT = 6.90; // 5% de desconto no Pix (137.90 -> 131.00)
// Valor final calculado com arredondamento explicito: 137.90 - 6.90 em ponto flutuante
// pode virar 131.00000000000003 em JS, e a SigiloPay rejeita esse formato com 400.
const PIX_TOTAL = Math.round((KIT_PRICE - PIX_DISCOUNT) * 100) / 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
  const secretKey = process.env.SIGILOPAY_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return res.status(500).json({ error: 'Credenciais da SigiloPay nao configuradas no servidor.' });
  }

  const customer = (req.body || {}).customer || {};
  const tracking = (req.body || {}).tracking || {};
  if (!customer.name || !customer.email || !customer.phone || !customer.document) {
    return res.status(400).json({ error: 'Dados do cliente incompletos.' });
  }

  const identifier = 'dermix-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const callbackUrl = proto + '://' + req.headers.host + '/api/pix-webhook';
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';

  try {
    const sigiloRes = await fetch('https://app.sigilopay.com.br/api/v1/gateway/pix/receive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
      body: JSON.stringify({
        identifier: identifier,
        amount: PIX_TOTAL,
        discount: PIX_DISCOUNT,
        client: {
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          document: customer.document,
        },
        products: [
          {
            id: 'kit-dermix-antiacne',
            name: 'Kit Rotina Anti-Acne Dermix + Acnexis-02',
            quantity: 1,
            price: KIT_PRICE,
          },
        ],
        metadata: { origem: 'checkout-site', utm: tracking.utm || {} },
        callbackUrl: callbackUrl,
      }),
    });

    const data = await sigiloRes.json();

    if (!sigiloRes.ok || data.status === 'FAILED') {
      console.error('SigiloPay rejeitou a cobranca:', sigiloRes.status, JSON.stringify(data));
      return res.status(sigiloRes.status || 400).json({
        error: data.errorDescription || data.message || 'Falha ao criar cobranca Pix.',
        details: data.details || undefined,
      });
    }

    // Guarda o registro inicial (o webhook vai atualizar o status e disparar o CAPI quando o Pix for pago).
    await kvSet(
      'pix:' + data.transactionId,
      {
        status: data.transactionStatus || 'PENDING',
        webhookToken: data.webhookToken || null,
        amount: PIX_TOTAL,
        customer: customer,
        fbp: tracking.fbp || '',
        fbc: tracking.fbc || '',
        sourceUrl: tracking.sourceUrl || '',
        clientIp: clientIp,
        userAgent: userAgent,
        capiPurchaseSent: false,
      },
      60 * 60 * 24
    );

    return res.status(200).json({
      transactionId: data.transactionId,
      status: data.transactionStatus,
      pixCode: data.pix && data.pix.code,
      pixImage: data.pix && data.pix.image,
      pixBase64: data.pix && data.pix.base64,
      expiresAt: data.pix && data.pix.expiresAt,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao conectar com o processador de pagamento.' });
  }
}
