// 只夠 render.ts 使用的 DOM 替身：createElement / append / textContent / addEventListener。
// 比拉進 jsdom 輕得多，目的只是確認畫面在各種資料下畫得出來、且按鈕接得上處理函式。

export class StubElement {
  className = '';
  title = '';
  readonly children: StubElement[] = [];
  private ownText = '';
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(readonly tagName: string) {}

  set textContent(value: string) {
    this.ownText = value;
    this.children.length = 0;
  }

  get textContent(): string {
    return this.ownText + this.children.map((child) => child.textContent).join('');
  }

  append(...nodes: StubElement[]): void {
    this.children.push(...nodes);
  }

  addEventListener(type: string, handler: () => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(handler);
    this.listeners.set(type, existing);
  }

  click(): void {
    for (const handler of this.listeners.get('click') ?? []) {
      handler();
    }
  }
}

/** 安裝全域 document，回傳還原用的函式。 */
export function installDom(): () => void {
  const original = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => new StubElement(tag),
  };
  return () => {
    (globalThis as { document?: unknown }).document = original;
  };
}

export function createRoot(): StubElement {
  return new StubElement('div');
}

export function findAll(root: StubElement, className: string): StubElement[] {
  const found: StubElement[] = [];
  const matches = (element: StubElement) => element.className.split(/\s+/).includes(className);

  const walk = (element: StubElement) => {
    if (matches(element)) {
      found.push(element);
    }
    for (const child of element.children) {
      walk(child);
    }
  };
  walk(root);
  return found;
}

export function findOne(root: StubElement, className: string): StubElement | undefined {
  return findAll(root, className)[0];
}

export function findButton(root: StubElement, label: string): StubElement | undefined {
  const walk = (element: StubElement): StubElement | undefined => {
    if (element.tagName === 'button' && element.textContent === label) {
      return element;
    }
    for (const child of element.children) {
      const found = walk(child);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  return walk(root);
}
