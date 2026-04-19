import { z } from "zod";

export const ExtractionSchema = z.object({
  operator_name: z.string(),
  well_name: z.string(),
  api_number: z.string(),
  production_month: z.string(),
  decimal_interest: z.number(),
  net_volume: z.number(),
  unit: z.enum(["bbl", "mcf"]),
  product_type: z.enum(["oil", "gas"]),
  gross_value: z.number(),
  total_deductions: z.number(),
  net_check_amount: z.number(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
