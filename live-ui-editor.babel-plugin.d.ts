import type { PluginItem } from "@babel/core";

declare const liveUiEditorBabelPlugin: PluginItem;

export default liveUiEditorBabelPlugin;
export function setLiveUiEditorEnabled(enabled: boolean): void;
