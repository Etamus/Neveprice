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
    <div className="h-[430px] w-full overflow-hidden rounded-md bg-white px-3 py-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 18, right: 26, left: 16, bottom: 88 }}
        >
          <CartesianGrid
            stroke="#e5e7eb"
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
            tick={{ fill: "#1f2937", fontSize: 11, fontWeight: 600 }}
            tickMargin={16}
            height={92}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#4b5563", fontSize: 12 }}
            tickFormatter={(value) => formatCurrency(Number(value))}
            width={92}
          />
          <Tooltip
            cursor={{ stroke: "#a3a3a3", strokeDasharray: "4 4" }}
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "6px",
              boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
              color: "#000000",
              fontFamily: '"Segoe UI", Arial, sans-serif',
            }}
            formatter={(value) => [formatCurrency(Number(value)), "Preço"]}
            labelStyle={{ color: "#111827", fontWeight: 700 }}
          />
          <Line
            type="linear"
            dataKey="price"
            name="Preço"
            stroke="#111827"
            strokeWidth={3}
            dot={{ r: 5, strokeWidth: 2, fill: "#ffffff", stroke: "#111827" }}
            activeDot={{
              r: 7,
              strokeWidth: 2,
              fill: "#111827",
              stroke: "#ffffff",
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
