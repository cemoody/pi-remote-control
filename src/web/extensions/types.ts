import type { ReactNode } from "react";

export interface WebActivityContribution {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  /** Built-in icon name the extension requested for its sidebar entry. */
  readonly icon?: string;
  readonly extensionId: string;
  render(): ReactNode;
}
