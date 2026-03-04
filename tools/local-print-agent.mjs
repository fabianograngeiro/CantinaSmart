#!/usr/bin/env node
import http from 'http';
import { exec as execCallback, spawn } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);
const PORT = Number(process.env.PRINT_AGENT_PORT || 18181);
const HOST = process.env.PRINT_AGENT_HOST || '127.0.0.1';

const json = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf-8');
  if (!raw) return {};
  return JSON.parse(raw);
};

const parseLinuxOrMacPrinterNames = (stdout) => {
  const lines = String(stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines
    .filter((line) => line.toLowerCase().startsWith('printer '))
    .map((line) => line.split(' ')[1]?.trim())
    .filter(Boolean);
};

const parseLinuxOrMacFallbackNames = (stdout) => {
  const lines = String(stdout || '').split('\n').map((line) => line.trim()).filter(Boolean);
  return lines
    .map((line) => line.split(/\s+/)[0]?.trim())
    .filter(Boolean);
};

const parseLinuxDefaultName = (stdout) => {
  const line = String(stdout || '')
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith('system default destination:'));
  if (!line) return '';
  return line.split(':').slice(1).join(':').trim();
};

const parseLinuxDefaultNameFromOptions = (stdout) => {
  const line = String(stdout || '').trim();
  const match = line.match(/^default\s+(.+)$/i);
  return match ? String(match[1]).trim() : '';
};

const parseWindowsPrinters = (stdout) => {
  try {
    const parsed = JSON.parse(String(stdout || '[]'));
    const asArray = Array.isArray(parsed) ? parsed : [parsed];
    return asArray
      .map((item) => ({
        name: String(item?.Name || '').trim(),
        isDefault: Boolean(item?.Default),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
};

const listSystemPrinters = async () => {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await exec('powershell -NoProfile -Command "Get-Printer | Select-Object Name,Default | ConvertTo-Json -Compress"');
      const printers = parseWindowsPrinters(stdout);
      if (printers.length > 0) return printers;
    } catch {}

    const { stdout } = await exec('powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name,Default | ConvertTo-Json -Compress"');
    return parseWindowsPrinters(stdout);
  }

  let names = [];
  try {
    const { stdout } = await exec('lpstat -p');
    names = parseLinuxOrMacPrinterNames(stdout);
  } catch {}

  if (names.length === 0) {
    try {
      const { stdout } = await exec('lpstat -a');
      names = parseLinuxOrMacFallbackNames(stdout);
    } catch {}
  }

  let defaultName = '';
  try {
    const { stdout } = await exec('lpstat -d');
    defaultName = parseLinuxDefaultName(stdout);
  } catch {}

  if (!defaultName) {
    try {
      const { stdout } = await exec('lpoptions -d');
      defaultName = parseLinuxDefaultNameFromOptions(stdout);
    } catch {}
  }

  const unique = Array.from(new Set(names));
  return unique.map((name) => ({
    name,
    isDefault: Boolean(defaultName) && name === defaultName
  }));
};

const buildReceiptText = (payload) => {
  const rows = Array.isArray(payload?.items) ? payload.items : [];
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const line = '-'.repeat(40);
  const lines = [];
  lines.push(String(payload?.enterpriseName || 'Cantina Smart'));
  lines.push('Cupom nao fiscal');
  lines.push(`${String(payload?.date || '')} ${String(payload?.time || '')}`.trim());
  lines.push(line);
  lines.push(`Cliente: ${String(payload?.clientName || 'Consumidor Final')}`);
  lines.push(line);

  rows.forEach((item) => {
    lines.push(`${Number(item?.quantity || 0)}x ${String(item?.name || '')}`);
    lines.push(`  R$ ${Number(item?.total || 0).toFixed(2)}`);
  });

  lines.push(line);
  payments.forEach((payment) => {
    lines.push(`${String(payment?.method || '')}: R$ ${Number(payment?.amount || 0).toFixed(2)}`);
  });
  lines.push(line);
  lines.push(`TOTAL: R$ ${Number(payload?.total || 0).toFixed(2)}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
};

const printText = async (text, printerName = '') => {
  if (process.platform === 'win32') {
    const escaped = String(text || '').replace(/'/g, "''");
    const escapedPrinter = String(printerName || '').replace(/'/g, "''");
    const command = escapedPrinter
      ? `$content = @'\n${escaped}\n'@; $content | Out-Printer -Name '${escapedPrinter}'`
      : `$content = @'\n${escaped}\n'@; $content | Out-Printer`;
    await exec(`powershell -NoProfile -Command "${command}"`);
    return;
  }

  await new Promise((resolve, reject) => {
    const args = printerName ? ['-d', printerName] : [];
    const child = spawn('lp', args);
    child.stdin.write(text);
    child.stdin.end();
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`lp finalizou com código ${code}`));
    });
  });
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { success: true, status: 'ok', platform: process.platform });
  }

  if (req.method === 'GET' && req.url === '/printers') {
    try {
      const printers = await listSystemPrinters();
      return json(res, 200, { success: true, platform: process.platform, printers });
    } catch (err) {
      return json(res, 500, {
        success: false,
        message: 'Erro ao listar impressoras locais.',
        error: err instanceof Error ? err.message : 'Erro desconhecido',
        printers: []
      });
    }
  }

  if (req.method === 'POST' && req.url === '/print-receipt') {
    try {
      const payload = await parseBody(req);
      const text = buildReceiptText(payload);
      await printText(text, String(payload?.printerName || ''));
      return json(res, 200, { success: true, message: 'Cupom enviado para impressão local.' });
    } catch (err) {
      return json(res, 500, {
        success: false,
        message: 'Erro ao imprimir cupom local.',
        error: err instanceof Error ? err.message : 'Erro desconhecido'
      });
    }
  }

  return json(res, 404, { success: false, message: 'Rota não encontrada.' });
});

server.listen(PORT, HOST, () => {
  console.log(`[Local Print Agent] Rodando em http://${HOST}:${PORT}`);
  console.log('[Local Print Agent] Rotas: GET /health | GET /printers | POST /print-receipt');
});
