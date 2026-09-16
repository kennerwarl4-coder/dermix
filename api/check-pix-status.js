// Serverless function (Vercel) — consulta o status de uma transacao Pix na SigiloPay.
// Chamada pelo front-end via polling (a cada 5s, com timeout de 10min) enquanto a tela
// de QR code esta aberta. A propria SigiloPay recomenda webhook em vez de polling
// frequente para uso em producao com muito volume; aqui optamos por polling espacado
// por simplicidade, e o front para de perguntar apos 10 minutos.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const publicKey = process.env.SIGILOPAY_PUBLIC_KEY;
  const secretKey = process.env.SIGILOPAY_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return res.status(500).json({ error: 'Credenciais da SigiloPay nao configuradas no servidor.' });
  }

  const transactionId = req.query.transactionId;
  if (!transactionId) {
    return res.status(400).json({ error: 'transactionId obrigatorio.' });
  }

  try {
    const url = 'https://app.sigilopay.com.br/api/v1/gateway/transactions?id=' + encodeURIComponent(transactionId);
    const sigiloRes = await fetch(url, {
      method: 'GET',
      headers: {
        'x-public-key': publicKey,
        'x-secret-key': secretKey,
      },
    });

    const data = await sigiloRes.json();

    if (!sigiloRes.ok) {
      return res.status(sigiloRes.status).json({ error: data.message || 'Falha ao consultar transacao.' });
    }

    return res.status(200).json({
      status: data.status, // PENDING | COMPLETED | FAILED
      errorDescription: data.errorDescription || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao consultar status do pagamento.' });
  }
}
