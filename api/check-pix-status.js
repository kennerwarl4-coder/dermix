// Serverless function (Vercel) — le o status da transacao do NOSSO storage (Upstash),
// que e atualizado pelo webhook (api/pix-webhook.js). O front-end pode consultar isso
// com a frequencia que quiser, sem risco de bloqueio, ja que nao bate na API da SigiloPay.

import { kvGet } from '../lib/kv.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const transactionId = req.query.transactionId;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId obrigatorio.' });
  }

  try {
    const record = await kvGet('pix:' + transactionId);
    return res.status(200).json({ status: (record && record.status) || 'PENDING' });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar status do pagamento.' });
  }
}
