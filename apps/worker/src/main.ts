import { readConfig } from "./config";
import { work } from "./loop";
import { createSupabaseDb } from "./supabase-db";

const log = (message: string): void => {
  console.log(`${new Date().toISOString()} ${message}`);
};

async function main(): Promise<void> {
  const config = readConfig(process.env, process.argv.slice(2));
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      log(`${signal} received, finishing the current day`);
      stopping = true;
    });
  }
  log(`worker ${config.workerId} started${config.once ? " (once)" : ""}`);
  await work(createSupabaseDb(config), {
    ...config,
    shouldStop: () => stopping,
  });
  log("worker stopped");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
