import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Product } from "../models/product.model";

interface PriceChartProps {
  products: Product[];
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCurrency = (value: number) => currencyFormatter.format(value || 0);

const chartColors = {
  accent: "#0e7490",
  accentStrong: "#155e75",
  border: "#d4e3e8",
  ink: "#132126",
  muted: "#5e7178",
  surface: "#ffffff",
};

export const PriceChart = ({ products }: PriceChartProps) => {
  const cheapestByStore = new Map<string, { store: string; price: number }>();

  products
    .filter((product) => product.current_price && !isNaN(Number(product.current_price)))
    .forEach((product) => {
      const price = Number(product.current_price);
      const current = cheapestByStore.get(product.store);

      if (!current || price < current.price) {
        cheapestByStore.set(product.store, {
          store: product.store,
          price,
        });
      }
    });

  const chartData = Array.from(cheapestByStore.values()).sort(
    (a, b) => a.price - b.price,
  );

  if (chartData.length === 0) {
    return null;
  }

  return (
    <div className="h-[430px] w-full overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-surface-soft)] px-3 py-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 18, right: 26, left: 16, bottom: 88 }}
        >
          <CartesianGrid
            stroke={chartColors.border}
            strokeDasharray="4 4"
            vertical={false}
          />
          <XAxis
            dataKey="store"
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={8}
            angle={-35}
            textAnchor="end"
            tick={{ fill: chartColors.ink, fontSize: 11, fontWeight: 600 }}
            tickMargin={16}
            height={92}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: chartColors.muted, fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(Number(value))}
            width={92}
          />
          <Tooltip
            cursor={{ stroke: chartColors.muted, strokeDasharray: "4 4" }}
            contentStyle={{
              backgroundColor: chartColors.surface,
              border: `1px solid ${chartColors.border}`,
              borderRadius: "8px",
              boxShadow: "0 18px 45px rgba(20,32,29,0.12)",
              color: chartColors.ink,
              fontFamily: "inherit",
            }}
            formatter={(value) => [formatCurrency(Number(value)), "Preço"]}
            labelStyle={{ color: chartColors.ink, fontWeight: 700 }}
          />
          <Line
            type="linear"
            dataKey="price"
            name="Preço"
            stroke={chartColors.accent}
            strokeWidth={3}
            dot={{
              r: 5,
              strokeWidth: 2,
              fill: chartColors.surface,
              stroke: chartColors.accent,
            }}
            activeDot={{
              r: 7,
              strokeWidth: 2,
              fill: chartColors.accentStrong,
              stroke: chartColors.surface,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
