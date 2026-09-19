import type { EnergyRepository } from "@/lib/repository";
import { isSupabaseConfigured } from "@/lib/repository";
import { DemoRepository } from "@/lib/repositories/demo";
import { SupabaseRepository } from "@/lib/repositories/supabase";

let repository: EnergyRepository | null = null;

export function getRepository(): EnergyRepository {
  if (!repository) repository = isSupabaseConfigured() ? new SupabaseRepository() : new DemoRepository();
  return repository;
}
