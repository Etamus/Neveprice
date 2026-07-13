import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import type { Product } from "../models/product.model";

interface PriceChartProps {
  products: Product[];
}

export const PriceChart = ({ products }: PriceChartProps) => {
  // Processamento dos dados
  const chartData = [...products]
    .filter((p) => p.current_price && !isNaN(Number(p.current_price)))
    .sort((a, b) => Number(a.current_price) - Number(b.current_price))
    .slice(0, 10)
    .map((p) => ({
      name: p.name.length > 15 ? p.name.substring(0, 15) + "..." : p.name,
      price: Number(p.current_price),
    }));

  if (chartData.length === 0) return null;

  return (
    <div className="flex flex-col items-center justify-center w-full overflow-hidden bg-white/5 p-6 rounded-3xl border border-white/10">
      <BarChart
        width={600}
        height={350}
        data={chartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#ffffff10"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          stroke="#94a3b8"
          fontSize={11}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `R$${v}`} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#0f172a",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
          }}
          itemStyle={{ color: "#22d3ee" }}
          formatter={(value: any) => [
            `R$ ${Number(value).toFixed(2)}`,
            "Preço",
          ]}
        />
        <Bar dataKey="price" radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={index === 0 ? "#22d3ee" : "#3b82f6"}
            />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
};
