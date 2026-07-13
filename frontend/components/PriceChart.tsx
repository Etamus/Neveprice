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
  const cheapestByStore = new Map<string, number>();

  products
    .filter((p) => p.current_price && !isNaN(Number(p.current_price)))
    .forEach((product) => {
      const price = Number(product.current_price);
      const currentPrice = cheapestByStore.get(product.store);

      if (!currentPrice || price < currentPrice) {
        cheapestByStore.set(product.store, price);
      }
    });

  const chartData = Array.from(cheapestByStore.entries())
    .map(([store, price]) => ({
      name: store,
      price,
    }))
    .sort((a, b) => a.price - b.price);

  if (chartData.length === 0) return null;

  return (
    <div className="flex w-full flex-col items-center justify-center overflow-hidden p-6">
      <BarChart
        width={600}
        height={350}
        data={chartData}
        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#d4d4d4"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          stroke="#000000"
          fontSize={11}
          angle={-45}
          textAnchor="end"
          height={80}
        />
        <YAxis stroke="#000000" fontSize={12} tickFormatter={(v) => `R$${v}`} />
        <Tooltip
          contentStyle={{
            backgroundColor: "#ffffff",
            border: "1px solid #000000",
            borderRadius: "8px",
            color: "#000000",
          }}
          itemStyle={{ color: "#000000" }}
          formatter={(value: any) => [
            `R$ ${Number(value).toFixed(2)}`,
            "Preço",
          ]}
        />
        <Bar dataKey="price" radius={[4, 4, 0, 0]}>
          {chartData.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={index === 0 ? "#000000" : "#525252"}
            />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
};
