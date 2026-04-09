import jsPDF from 'jspdf';

const isSupportedPdfImageDataUrl = (value: string) => /^data:image\/(png|jpe?g|webp);base64,/i.test(String(value || '').trim());

const resolvePdfImageType = (value: string): 'PNG' | 'JPEG' | 'WEBP' => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.startsWith('data:image/png')) return 'PNG';
  if (raw.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
};

export const drawEnterpriseLogoOnPdf = (
  doc: jsPDF,
  logoDataUrl: string,
  x: number,
  y: number,
  size: number,
  fallbackText: string = 'CS'
) => {
  const safeLogo = String(logoDataUrl || '').trim();

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x, y, size, size, 2, 2, 'FD');

  if (isSupportedPdfImageDataUrl(safeLogo)) {
    try {
      doc.addImage(safeLogo, resolvePdfImageType(safeLogo), x + 1, y + 1, size - 2, size - 2);
      return;
    } catch (error) {
      console.warn('Nao foi possivel desenhar logo no PDF:', error);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.max(7, size * 0.28));
  doc.setTextColor(79, 70, 229);
  doc.text(String(fallbackText || 'CS').slice(0, 3), x + (size / 2), y + (size * 0.6), { align: 'center' });
};

export const buildEnterpriseLogoHtml = (logoDataUrl: string, alt: string = 'Logo da empresa') => {
  const safeLogo = String(logoDataUrl || '').trim();
  if (!safeLogo) return '';
  return `<img src="${safeLogo}" alt="${String(alt || 'Logo')}" class="report-logo" />`;
};
