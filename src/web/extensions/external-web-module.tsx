import { useEffect, useState, type ReactNode } from "react";
import type { ExtensionActivityInfo, ExtensionRegistryInfo, SessionDashboardApi } from "../api/session-api.js";

export interface ExternalWebActivityProps {
  readonly activity: ExtensionActivityInfo;
  readonly extensions: ExtensionRegistryInfo;
  readonly api: SessionDashboardApi;
}

export type ExternalWebActivityComponent = (props: ExternalWebActivityProps) => ReactNode;

export interface ExternalWebActivityModule {
  readonly default?: ExternalWebActivityComponent;
  readonly renderActivity?: ExternalWebActivityComponent;
}

export function ExternalWebActivity(props: ExternalWebActivityProps) {
  const [state, setState] = useState<{ component?: ExternalWebActivityComponent; error?: string }>({});
  useEffect(() => {
    let cancelled = false;
    setState({});
    if (!props.activity.webModuleUrl) return;
    void import(/* @vite-ignore */ props.activity.webModuleUrl)
      .then((module: ExternalWebActivityModule) => {
        if (cancelled) return;
        const component = module.renderActivity ?? module.default;
        if (!component) setState({ error: `Web module for ${props.activity.id} does not export a renderer.` });
        else setState({ component });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ error: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [props.activity.id, props.activity.webModuleUrl]);

  if (!props.activity.webModuleUrl) return null;
  if (state.error) return <div role="alert" className="extension-web-error">Extension web module failed: {state.error}</div>;
  if (!state.component) return <div role="status" className="extension-web-loading">Loading extension UI…</div>;
  const Component = state.component;
  return <>{Component(props)}</>;
}
