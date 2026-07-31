import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Accessibility" };

const CONTENT = {
  en: {
    title: "Accessibility",
    intro:
      "This site targets WCAG 2.2 Level AA. Every visitor should be able to review the case, examine the released material, and contact the detective.",
    items: [
      "Full keyboard navigation with visible focus indicators.",
      "Semantic landmarks, headings, and labeled form fields.",
      "Text alternatives for images, including a written description of the released witness material.",
      "Screen-reader-announced form errors.",
      "Sufficient color contrast; no information conveyed by color alone.",
      "Reduced-motion support honoring your system preference.",
      "Captions or transcripts for any public video.",
      "Large tap targets and a mobile-first layout.",
    ],
    feedback:
      "If you encounter an accessibility barrier on this site, please email the campaign so it can be fixed promptly.",
  },
  es: {
    title: "Accesibilidad",
    intro:
      "Este sitio sigue las pautas WCAG 2.2 nivel AA. Todas las personas deben poder revisar el caso, examinar el material publicado y contactar al detective.",
    items: [
      "Navegación completa por teclado con indicadores de foco visibles.",
      "Regiones semánticas, encabezados y campos de formulario etiquetados.",
      "Alternativas de texto para las imágenes, incluida una descripción escrita del material del testigo.",
      "Errores de formulario anunciados por lectores de pantalla.",
      "Contraste de color suficiente; ninguna información se transmite solo con color.",
      "Soporte de movimiento reducido según la preferencia de su sistema.",
      "Subtítulos o transcripciones para cualquier video público.",
      "Objetivos táctiles grandes y diseño móvil primero.",
    ],
    feedback:
      "Si encuentra una barrera de accesibilidad en este sitio, escríbanos para corregirla lo antes posible.",
  },
} as const;

export default async function AccessibilityPage() {
  const { locale } = await getT();
  const content = CONTENT[locale];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      <p className="prose-serif mt-4 text-charcoal-800">{content.intro}</p>
      <ul className="mt-6 space-y-2">
        {content.items.map((item) => (
          <li key={item} className="flex items-start gap-2.5">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-steel-600" />
            <span className="text-charcoal-800">{item}</span>
          </li>
        ))}
      </ul>
      <p className="prose-serif mt-6 text-charcoal-800">{content.feedback}</p>
    </div>
  );
}
