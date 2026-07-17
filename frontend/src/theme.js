import { createTheme } from "@mantine/core";

// Tema base con principios de Material Design y accesibilidad, sobre Mantine.
//
// - Tipografía: stack "Roboto-first". En Android (la APK) el font del sistema
//   YA es Roboto, así que se obtiene el look Material real sin bundlear fuentes
//   ni pedir nada por red. En iOS/escritorio cae a la fuente del sistema.
// - Tamaños táctiles: los controles interactivos usan por defecto un tamaño
//   cómodo para el dedo (Material recomienda ~48dp); ver global.css para el
//   mínimo garantizado en punteros gruesos (móvil).
// - autoContrast: el texto sobre botones de color ajusta su contraste solo
//   (accesibilidad AA sin tener que pensarlo botón a botón).
// - focusRing 'auto': muestra el anillo de foco al navegar con teclado.

const FONT = 'Roboto, "Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 8 },
  autoContrast: true,
  focusRing: "auto",
  defaultRadius: "md",
  fontFamily: FONT,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  headings: {
    fontFamily: FONT,
    fontWeight: "600",
    sizes: {
      h1: { fontSize: "1.75rem", lineHeight: "1.25" },
      h2: { fontSize: "1.5rem", lineHeight: "1.3" },
      h3: { fontSize: "1.25rem", lineHeight: "1.35" },
      h4: { fontSize: "1.1rem", lineHeight: "1.4" },
    },
  },
  // Tamaños cómodos por defecto para el dedo. Los controles que fijan size="xs"
  // explícitamente (filtros secundarios) se respetan; los primarios heredan md.
  components: {
    Button: { defaultProps: { size: "md", radius: "md" } },
    TextInput: { defaultProps: { size: "md", radius: "md" } },
    PasswordInput: { defaultProps: { size: "md", radius: "md" } },
    Textarea: { defaultProps: { size: "md", radius: "md" } },
    NumberInput: { defaultProps: { size: "md", radius: "md" } },
    Select: { defaultProps: { size: "md", radius: "md" } },
    MultiSelect: { defaultProps: { size: "md", radius: "md" } },
    Checkbox: { defaultProps: { size: "md" } },
    Card: { defaultProps: { radius: "md", withBorder: true } },
    Modal: { defaultProps: { radius: "md", centered: true } },
  },
});
