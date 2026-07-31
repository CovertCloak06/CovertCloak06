import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Terms of Use" };

const CONTENT = {
  en: {
    title: "Terms of Use",
    sections: [
      {
        heading: "Purpose",
        body: "This site exists to publish verified case information, display law-enforcement-released material, and help community members route specific information to the assigned detective. It is not a social network, a crowdsourced suspect board, or an investigation platform.",
      },
      {
        heading: "Prohibited conduct",
        body: "You may not use this site or its materials to publicly accuse, confront, threaten, harass, or dox any person; to publish names of alleged suspects, home addresses, personal phone numbers, or private social-media profiles; or to interfere with the law-enforcement investigation. The person shown in released material is a potential witness or person police are seeking to identify — nothing on this site labels anyone a suspect.",
      },
      {
        heading: "No emergency use",
        body: "This site is not an emergency reporting system. If someone is in danger, call 911.",
      },
      {
        heading: "Information handling",
        body: "Information submitted through this site may be forwarded to law enforcement. Submission does not create any attorney, agency, or confidential relationship.",
      },
      {
        heading: "Accuracy and corrections",
        body: "Public content is limited to administrator-approved, source-attributed material. If you believe something published here is inaccurate, contact the campaign so a correction can be reviewed and, where warranted, published with a correction note.",
      },
    ],
  },
  es: {
    title: "Términos de uso",
    sections: [
      {
        heading: "Propósito",
        body: "Este sitio existe para publicar información verificada del caso, mostrar material difundido por la policía y ayudar a la comunidad a hacer llegar información específica al detective asignado. No es una red social, ni un tablero de sospechosos, ni una plataforma de investigación.",
      },
      {
        heading: "Conducta prohibida",
        body: "No puede usar este sitio ni sus materiales para acusar públicamente, confrontar, amenazar, acosar o exponer a ninguna persona; para publicar nombres de presuntos sospechosos, domicilios, teléfonos personales o perfiles privados de redes sociales; ni para interferir con la investigación policial. La persona que aparece en el material difundido es un posible testigo o alguien que la policía busca identificar; nada en este sitio señala a nadie como sospechoso.",
      },
      {
        heading: "No usar en emergencias",
        body: "Este sitio no es un sistema de emergencias. Si alguien está en peligro, llame al 911.",
      },
      {
        heading: "Manejo de la información",
        body: "La información enviada a través de este sitio puede remitirse a la policía. El envío no crea ninguna relación confidencial ni de representación.",
      },
      {
        heading: "Precisión y correcciones",
        body: "El contenido público se limita a material aprobado por administradores y con fuentes atribuidas. Si cree que algo publicado aquí es incorrecto, contacte a la campaña para revisar la corrección y, de ser procedente, publicarla con una nota.",
      },
    ],
  },
} as const;

export default async function TermsPage() {
  const { locale } = await getT();
  const content = CONTENT[locale];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold tracking-tight">{content.title}</h1>
      {content.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="text-xl font-semibold">{section.heading}</h2>
          <p className="prose-serif mt-2 text-charcoal-800">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
