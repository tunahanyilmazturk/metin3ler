type Handler = (payload: any) => void;

/** Sistemler arası gevşek bağlı iletişim için basit olay yolu. */
export class EventBus {
  private map = new Map<string, Handler[]>();

  on(name: string, fn: Handler) {
    const list = this.map.get(name) ?? [];
    list.push(fn);
    this.map.set(name, list);
  }

  emit(name: string, payload?: any) {
    const list = this.map.get(name);
    if (list) for (const fn of list) fn(payload);
  }
}
