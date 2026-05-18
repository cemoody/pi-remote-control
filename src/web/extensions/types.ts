import type { ReactNode } from "react";

export interface WebActivityContribution {
  readonly id: string;
  readonly title: string;
  readonly order?: number;
  readonly extensionId: string;
  render(): ReactNode;
}
