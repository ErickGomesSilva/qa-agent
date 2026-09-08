export type K6ScriptResult = {
  script: string;
  name: string;
  passed: boolean;
  exitCode: number;
  checksPass?: number;
  checksFail?: number;
  httpReqFailedRate?: number;
  httpReqDurationP95?: number;
  summaryPath: string;
  logPath: string;
};

export type K6Outcome = {
  passed: boolean;
  scripts: K6ScriptResult[];
  logPath: string;
  reportMdPath?: string;
  reportJsonPath?: string;
};

export type K6SummaryExport = {
  metrics?: Record<
    string,
    {
      type?: string;
      values?: Record<string, number>;
      passes?: number;
      fails?: number;
      value?: number;
      avg?: number;
      "p(95)"?: number;
    }
  >;
};
