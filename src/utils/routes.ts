export function isShowerDesignerRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/shower-designer';
}

export function isEmbeddedDesignerMode(): boolean {
  return isShowerDesignerRoute();
}
