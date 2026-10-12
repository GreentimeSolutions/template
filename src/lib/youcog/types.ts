export type Source = { url: string; title: string };

export type MissionResult = {
  ok: true;
  brief: string;
  sources: Source[];
  stored: false;
};
