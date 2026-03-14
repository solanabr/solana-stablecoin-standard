import { Command } from "commander";

import { getCliConfigPath, initializeCliConfigFile, setCliConfigValue, showCliConfig } from "../config";
import { resolveCliContext } from "../context";
import { renderKeyValueLines, writeStructuredOutput } from "../output";

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Persistent CLI configuration");

  config
    .command("init")
    .description("Create the default CLI config file")
    .action(function (this: Command) {
      const context = resolveCliContext(this);
      const initialized = initializeCliConfigFile();
      const payload = {
        command: "config init",
        config: showCliConfig(initialized)
      };
      const text = ["Initialized CLI config", renderKeyValueLines(Object.entries(showCliConfig(initialized)))].join("\n");
      writeStructuredOutput(context, payload, text);
    });

  config
    .command("set <key> <value>")
    .description("Set a config value")
    .action(function (this: Command, key, value) {
      const context = resolveCliContext(this);
      const updated = setCliConfigValue(key, value);
      const payload = {
        command: "config set",
        key,
        value,
        config: showCliConfig(updated)
      };
      const text = [
        `Updated config key: ${key}`,
        renderKeyValueLines(Object.entries(showCliConfig(updated)))
      ].join("\n");
      writeStructuredOutput(context, payload, text);
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(function (this: Command) {
      const context = resolveCliContext(this);
      const current = showCliConfig();
      writeStructuredOutput(
        context,
        { command: "config show", config: current },
        ["CLI configuration", renderKeyValueLines(Object.entries(current))].join("\n")
      );
    });

  config
    .command("path")
    .description("Print the config file path")
    .action(function (this: Command) {
      const context = resolveCliContext(this);
      const configPath = getCliConfigPath();
      writeStructuredOutput(
        context,
        { command: "config path", path: configPath },
        configPath
      );
    });
}
