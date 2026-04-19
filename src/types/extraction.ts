import { z } from "zod";

export const LineItemSchema = z.object({
  production_month: z.string(),
  product_type: z.enum(["oil", "gas", "ngl"]),
  unit: z.enum(["bbl", "mcf", "gal"]),
  owner_volume: z.number(),
  price_per_unit: z.number(),
  owner_gross: z.number(),
  owner_deductions: z.number(),
  taxes: z.number(),
  owner_net: z.number(),
});

export const ExtractionSchema = z.object({
  operator_name: z.string(),
  well_name: z.string(),
  api_number: z.string(),
  decimal_interest: z.number(),
  net_check_amount: z.number(),
  line_items: z.array(LineItemSchema),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Extraction = z.infer<typeof ExtractionSchema>;
