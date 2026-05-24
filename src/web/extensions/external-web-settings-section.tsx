import * as React from "react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  ExtensionRegistryInfo,
  ExtensionSettingsSectionInfo,
  SessionDashboardApi,
} from "../api/session-api.js";

export interface ExternalWebSettingsSectionProps {
  readonly section: ExtensionSettingsSectionInfo;
  readonly extensions: ExtensionRegistryInfo;
  readonly api: SessionDashboardApi;
  /** React is supplied by the host so external modules can be plain ESM without bundling React. */
  readonly React?: typeof React;
}

export type ExternalWebSettingsSectionComponent = (
  props: ExternalWebSettingsSectionProps,
) => ReactNode;

export interface ExternalWebSettingsSectionModule {
  readonly default?: ExternalWebSettingsSectionComponent;
  readonly renderSettingsSection?: ExternalWebSettingsSectionComponent;
}

export function ExternalWebSettingsSection(props: ExternalWebSettingsSectionProps) {
  const [state, setState] = useState<{ component?: ExternalWebSettingsSectionComponent; error?: string }>({});
  useEffect(() => {
    let cancelled = false;
    setState({});
    if (!props.section.webModuleUrl) return;
    void import(/* @vite-ignore */ props.section.webModuleUrl)
      .then((module: ExternalWebSettingsSectionModule) => {
        if (cancelled) return;
        const component = module.renderSettingsSection ?? module.default;
        if (!component) setState({ error: `Web module for ${props.section.id} does not export a renderer.` });
        else setState({ component });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ error: error instanceof Error ? error.message : String(error) });
      });
    return () => { cancelled = true; };
  }, [props.section.id, props.section.webModuleUrl]);

  if (!props.section.webModuleUrl) {
    return (
      <div className="extension-web-placeholder" role="note">
        No settings UI provided by <code>{props.section.extensionId}</code>.
      </div>
    );
  }
  if (state.error) return <div role="alert" className="extension-web-error">Extension settings module failed: {state.error}</div>;
  if (!state.component) return <div role="status" className="extension-web-loading">Loading extension settings…</div>;
  const Component = state.component;
  return <>{Component({ ...props, React })}</>;
}
