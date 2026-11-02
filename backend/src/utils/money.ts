import { Decimal } from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value;

export function money(value: MoneyInput = 0): Decimal {
  return new Decimal(value);
}

export function toNumber(value: MoneyInput): number {
  return money(value).toDecimalPlaces(2).toNumber();
}

export function toFixed(value: MoneyInput): string {
  return money(value).toFixed(2);
}

export function add(...values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), money(0));
}

export function sub(a: MoneyInput, b: MoneyInput): Decimal {
  return money(a).minus(money(b));
}

export function maxMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const aa = money(a);
  const bb = money(b);
  return aa.greaterThan(bb) ? aa : bb;
}

export function minMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const aa = money(a);
  const bb = money(b);
  return aa.lessThan(bb) ? aa : bb;
}

export function isPositive(value: MoneyInput): boolean {
  return money(value).greaterThan(0);
}

export function isZero(value: MoneyInput): boolean {
  return money(value).equals(0);
}
