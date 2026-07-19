import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { ClientOrder } from "@/lib/types/orders";

interface PartnerInfo {
  nome: string;
  codice_amway: string | null;
  telefono: string | null;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  logo: { fontSize: 22, fontWeight: 700 },
  titleBlock: { alignItems: "flex-end" },
  title: { fontSize: 11, fontWeight: 700, marginBottom: 2 },
  section: { borderWidth: 1, borderColor: "#999999", padding: 8, marginBottom: 10 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { fontWeight: 700, marginRight: 4 },
  table: { borderWidth: 1, borderColor: "#999999", marginBottom: 10 },
  tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#cccccc" },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f0f0f0", borderBottomWidth: 1, borderBottomColor: "#999999" },
  cellHeader: { fontWeight: 700, padding: 4 },
  colCodice: { width: "15%", padding: 4 },
  colQta: { width: "10%", padding: 4 },
  colDescrizione: { width: "55%", padding: 4 },
  colPrezzo: { width: "20%", padding: 4, textAlign: "right" },
  totaleBox: { alignSelf: "flex-end", width: 220, borderWidth: 1, borderColor: "#999999", marginBottom: 24 },
  totaleRow: { flexDirection: "row", justifyContent: "space-between", padding: 6 },
  totaleLabel: { fontWeight: 700 },
  firma: { marginTop: 20, borderTopWidth: 1, borderTopColor: "#999999", width: 200, paddingTop: 4 },
  footer: { marginTop: 24, borderTopWidth: 1, borderTopColor: "#999999", paddingTop: 8 },
  footerTitle: { fontWeight: 700, marginBottom: 4 },
});

export function receiptNumber(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function ReceiptDocument({ order, partner }: { order: ClientOrder; partner: PartnerInfo }) {
  const customerName = order.customer
    ? `${order.customer.nome} ${order.customer.cognome || ""}`.trim()
    : "Cliente";
  const items = order.items || [];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.logo}>Amway</Text>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>MODULO D&apos;ORDINE — RICEVUTA N. {receiptNumber(order.id)}</Text>
            <Text>Data: {formatDate(order.created_at)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Cliente:</Text>
            <Text>{customerName}</Text>
          </View>
          {order.customer?.indirizzo ? (
            <View style={styles.row}>
              <Text style={styles.label}>Indirizzo:</Text>
              <Text>{order.customer.indirizzo}</Text>
            </View>
          ) : null}
          {order.customer?.citta ? (
            <View style={styles.row}>
              <Text style={styles.label}>Città:</Text>
              <Text>{order.customer.citta}</Text>
            </View>
          ) : null}
          {order.customer?.telefono ? (
            <View style={styles.row}>
              <Text style={styles.label}>Telefono:</Text>
              <Text>{order.customer.telefono}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.colCodice, styles.cellHeader]}>Codice</Text>
            <Text style={[styles.colQta, styles.cellHeader]}>Q.tà</Text>
            <Text style={[styles.colDescrizione, styles.cellHeader]}>Descrizione</Text>
            <Text style={[styles.colPrezzo, styles.cellHeader]}>Prezzo (IVA inclusa)</Text>
          </View>
          {items.map((it) => (
            <View key={it.id} style={styles.tableRow}>
              <Text style={styles.colCodice}>{it.product?.codice_amway || "—"}</Text>
              <Text style={styles.colQta}>{it.quantita}</Text>
              <Text style={styles.colDescrizione}>{it.product?.descrizione || "—"}</Text>
              <Text style={styles.colPrezzo}>{"€"}{(it.prezzo_unitario_cliente * it.quantita).toFixed(2)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totaleBox}>
          <View style={styles.totaleRow}>
            <Text style={styles.totaleLabel}>Totale da pagare</Text>
            <Text style={styles.totaleLabel}>{"€"}{order.totale_cliente.toFixed(2)}</Text>
          </View>
        </View>

        <View style={styles.firma}>
          <Text>Firma del cliente</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerTitle}>IL VOSTRO PARTNER AMWAY</Text>
          <Text>Nome e cognome: {partner.nome}</Text>
          {partner.codice_amway ? <Text>Codice Amway: {partner.codice_amway}</Text> : null}
          {partner.telefono ? <Text>Telefono: {partner.telefono}</Text> : null}
          <Text style={{ marginTop: 8 }}>Grazie per il suo ordine!</Text>
        </View>
      </Page>
    </Document>
  );
}

export async function buildReceiptPdfBuffer(order: ClientOrder, partner: PartnerInfo): Promise<Buffer> {
  return renderToBuffer(<ReceiptDocument order={order} partner={partner} />);
}
