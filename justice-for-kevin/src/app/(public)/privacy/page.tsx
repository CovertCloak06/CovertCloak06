import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy" };

const CONTENT = {
  en: {
    title: "Privacy",
    sections: [
      {
        heading: "What this site is",
        body: "This website is a community awareness campaign platform for the Kevin Vandenbos homicide investigation. It is not operated by the Antioch Police Department unless formally approved, and it is not an emergency reporting system. In an emergency, call 911.",
      },
      {
        heading: "Submitting information",
        body: "By default, this site does not store the information you enter in the submission form — it formats a report that you deliver directly to Detective John Cox. If administrators enable secure intake, submissions are stored privately, may be forwarded to law enforcement, and are never published. Submitting information here does not guarantee that police have received it; only a confirmed delivery does.",
      },
      {
        heading: "Anonymous submissions",
        body: "You may submit anonymously. Anonymous information may be more difficult to verify and follow up on.",
      },
      {
        heading: "Files and metadata",
        body: "Files you upload may contain metadata (such as time, device, or location details). Original files are kept private and hashed for integrity; public derivatives have metadata removed, and GPS metadata is never exposed publicly.",
      },
      {
        heading: "What we do not do",
        body: "We do not sell data. We do not use advertising trackers. We do not build public user profiles. We do not track you across unrelated websites or fingerprint your device. Analytics, when enabled, are privacy-conscious aggregate metrics only.",
      },
      {
        heading: "Public accusations",
        body: "Public accusations are prohibited on this platform. No submission is ever published, and no person is publicly labeled a suspect.",
      },
    ],
  },
  es: {
    title: "Privacidad",
    sections: [
      {
        heading: "Qué es este sitio",
        body: "Este sitio web es una plataforma comunitaria de concientización sobre la investigación del homicidio de Kevin Vandenbos. No es operado por el Departamento de Policía de Antioch a menos que se apruebe formalmente, y no es un sistema de emergencias. En una emergencia, llame al 911.",
      },
      {
        heading: "Envío de información",
        body: "De forma predeterminada, este sitio no guarda la información que usted escribe en el formulario: genera un informe que usted entrega directamente al detective John Cox. Si los administradores habilitan la recepción segura, los envíos se guardan de forma privada, pueden remitirse a la policía y nunca se publican. Enviar información aquí no garantiza que la policía la haya recibido; solo una entrega confirmada lo garantiza.",
      },
      {
        heading: "Envíos anónimos",
        body: "Puede enviar información de forma anónima. La información anónima puede ser más difícil de verificar y dar seguimiento.",
      },
      {
        heading: "Archivos y metadatos",
        body: "Los archivos que suba pueden contener metadatos (como hora, dispositivo o ubicación). Los archivos originales se mantienen privados y con hash de integridad; las copias públicas se limpian de metadatos y los datos GPS nunca se exponen públicamente.",
      },
      {
        heading: "Lo que no hacemos",
        body: "No vendemos datos. No usamos rastreadores publicitarios. No creamos perfiles públicos de usuarios. No lo rastreamos en otros sitios ni identificamos su dispositivo. Las analíticas, cuando están habilitadas, son solo métricas agregadas respetuosas de la privacidad.",
      },
      {
        heading: "Acusaciones públicas",
        body: "Las acusaciones públicas están prohibidas en esta plataforma. Ningún envío se publica y ninguna persona es señalada públicamente como sospechosa.",
      },
    ],
  },
} as const;

export default async function PrivacyPage() {
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
