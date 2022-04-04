import "dotenv/config";
import TestRail, { AddResultForCase } from "@dlenroc/testrail";
import stripAnsi from "strip-ansi";
import type { Config } from "@jest/types";
import type { Context } from "@jest/reporters";
import type { AggregatedResult } from "@jest/test-result";

interface TestRailReporterOptions {
  project_id: number;
  suite_id: number;
}

const config = {
  host: process.env.TESTRAIL_ENDPOINT,
  username: process.env.TESTRAIL_USERNAME,
  password: process.env.TESTRAIL_PASSWORD,
};

const isConfig = (c: typeof config): c is Record<keyof typeof config, string> =>
  Object.values(c).every((value) => typeof value === "string");

if (!isConfig(config)) {
  throw new Error(
    "Missing env var! The following need to be specified:\nTESTRAIL_ENDPOINT, TESTRAIL_USERNAME, TESTRAIL_PASSWORD"
  );
}

const api = new TestRail(config);

class Reporter {
  protected _globalConfig: Config.GlobalConfig;
  protected _options: TestRailReporterOptions;
  caseIds: number[];
  testRailResults: AddResultForCase[];

  constructor(
    globalConfig: Config.GlobalConfig,
    options: TestRailReporterOptions
  ) {
    console.log(config);
    this._globalConfig = globalConfig;
    this._options = options;
    this.caseIds = [];
    this.testRailResults = [];
  }

  async createRun(projectId: number, suiteId: number) {
    const now = new Date();

    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };

    let message = "Automated test run";
    try {
      const suite = await api.getSuite(suiteId);
      const name = `${suite.name} - ${now.toLocaleString(
        ["en-GB"],
        options
      )} - (${message})`;

      const { id } = await api.addRun(projectId, {
        suite_id: suiteId,
        name: name,
        include_all: false,
        case_ids: this.caseIds,
      });
      console.log("Created new test run: " + name);

      await api.addResultsForCases(id, {
        results: this.testRailResults,
      });
      await api.closeRun(id);
      console.log("Added test results and closed test run");
    } catch (error) {
      console.log(error instanceof Error ? error.message : error);
    }
  }

  onRunComplete(_contexts: Set<Context>, results: AggregatedResult) {
    const specResults = results.testResults;
    for (let j = 0; j < specResults.length; j += 1) {
      const itResults = specResults[j].testResults;

      for (let i = 0; i < itResults.length; i += 1) {
        const result = itResults[i];
        const id = result.title.split(":")[0];
        const idNum = parseInt(id, 10);

        if (!Number.isInteger(idNum)) {
          break;
        }

        this.caseIds.push(idNum);

        switch (result.status) {
          case "pending":
            this.testRailResults.push({
              case_id: parseInt(id, 10),
              status_id: 2,
              comment: "Intentionally skipped (xit).",
            });
            break;

          case "failed":
            this.testRailResults.push({
              case_id: parseInt(id, 10),
              status_id: 5,
              comment: stripAnsi(result.failureMessages[0]),
            });
            break;

          case "passed":
            this.testRailResults.push({
              case_id: parseInt(id, 10),
              status_id: 1,
              comment: "Test passed successfully.",
            });
            break;

          default:
            // unknown status
            break;
        }
      }
    }
    this.createRun(this._options.project_id, this._options.suite_id);
  }
}

module.exports = Reporter;
