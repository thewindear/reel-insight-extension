/** 在扩展页或嵌入抽屉中复制文字，浏览器拒绝异步写入时回退到选区复制。 */
export async function copyText(value: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(value);
    return;
  } catch {
    const previous = document.activeElement;
    const field = document.createElement('textarea');
    field.value = value;
    field.readOnly = true;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Clipboard write failed');
    } finally {
      field.remove();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    }
  }
}
