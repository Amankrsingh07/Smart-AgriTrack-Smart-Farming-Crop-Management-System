"use client";
import React, {
  Children,
  Fragment,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
  createContext,
  useContext,
} from "react";
import { useLocale } from "next-intl";
import { translateSoil } from "./translate";
const Catalog = createContext<Record<string, string> | undefined>(undefined);
export function SoilCatalogProvider({
  value,
  children,
}: {
  value: Record<string, string> | undefined;
  children: ReactNode;
}) {
  return <Catalog.Provider value={value}>{children}</Catalog.Provider>;
}
export function useSoilText() {
  const locale = useLocale();
  const catalog = useContext(Catalog);
  return (value: string) => translateSoil(locale, catalog, value);
}
/** Translate application-owned text; never touch form values, IDs or URLs. */
export function SoilLanguage({ children }: { children: ReactNode }) {
  const soilText = useSoilText();
  function translate(node: ReactNode): ReactNode {
    if (typeof node === "string") return soilText(node);
    if (!isValidElement(node)) return node;
    const element = node as ReactElement<Record<string, unknown>>;
    const props = element.props;
    if (
      props["data-soil-raw"] !== undefined ||
      (typeof element.type !== "string" && element.type !== Fragment)
    )
      return element;
    const updates: Record<string, unknown> = {};
    for (const key of ["title", "placeholder", "aria-label"])
      if (typeof props[key] === "string")
        updates[key] = soilText(props[key] as string);
    // HTML options without value derive their submitted value from their text.
    if (
      element.type === "option" &&
      props.value === undefined &&
      typeof props.children === "string"
    )
      updates.value = props.children;
    if (props.children !== undefined)
      updates.children = Children.map(props.children as ReactNode, translate);
    return cloneElement(element, updates);
  }
  return <>{Children.map(children, translate)}</>;
}
