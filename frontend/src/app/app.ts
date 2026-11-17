import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

type Location = 'Cochabamba' | 'Oruro' | 'Patacamaya' | 'La Paz';
type Profile = 'carrier' | 'shipper';

interface Route {
  id: number;
  origin: Location;
  destination: Location;
  distance_km: number;
  tolls_bob: number | null;
  data_status: 'estimated' | 'verified';
}

interface Cargo {
  id: number;
  origin: Location;
  destination: Location;
  description: string;
  weight_tons: number;
  offered_price_bob: number | null;
  pickup_at: string | null;
}

interface RouteAlert {
  id: number;
  origin: Location;
  destination: Location;
  alert_type: string;
  message: string;
  source: string | null;
  observed_at: string;
  expires_at: string | null;
}

interface AlertsResponse {
  alerts: RouteAlert[];
  liveFeed: boolean;
  note: string;
}

interface Quote {
  origin: Location;
  destination: Location;
  distanceKm: number;
  fuelLiters: number;
  fuelCostBob: number;
  tollsBob: number | null;
  subtotalBob: number;
  complete: boolean;
  message: string;
}

interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly locations: Location[] = ['Cochabamba', 'Oruro', 'Patacamaya', 'La Paz'];
  protected readonly mapMode = signal<'country' | 'route'>('country');
  protected readonly mapUrl = signal<SafeResourceUrl>(
    this.sanitizer.bypassSecurityTrustResourceUrl('https://maps.google.com/maps?hl=es&q=Bolivia&z=5&output=embed'),
  );
  protected readonly profile = signal<Profile | null>(null);
  protected readonly routes = signal<Route[]>([]);
  protected readonly cargos = signal<Cargo[]>([]);
  protected readonly alerts = signal<RouteAlert[]>([]);
  protected readonly alertsNote = signal('Cargando alertas registradas…');
  protected readonly apiOnline = signal(false);
  protected readonly quote = signal<Quote | null>(null);
  protected readonly loadingQuote = signal(false);
  protected readonly quoteError = signal('');
  protected readonly chatOpen = signal(false);
  protected readonly chatLoading = signal(false);
  protected readonly chatInput = signal('');
  protected readonly chatError = signal('');
  protected readonly messages = signal<ChatMessage[]>([
    { role: 'assistant', text: 'Hola. Puedo ayudarte con estimaciones y con la información registrada para Cochabamba, Oruro y La Paz.' },
  ]);
  protected origin: Location = 'Cochabamba';
  protected destination: Location = 'La Paz';
  protected fuelConsumption = 40;
  protected dieselPrice = '';
  protected reportOpen = false;
  protected reportRouteId = 0;
  protected reportMessage = '';
  protected reportStatus = '';
  protected reportError = '';
  protected reportSending = false;

  constructor() {
    this.http.get<Route[]>('/api/routes').subscribe({
      next: (routes) => {
        this.routes.set(routes);
        this.apiOnline.set(true);
      },
      error: () => this.apiOnline.set(false),
    });
    this.http.get<AlertsResponse>('/api/alerts').subscribe({
      next: (result) => {
        this.alerts.set(result.alerts);
        this.alertsNote.set(result.note);
      },
      error: () => this.alertsNote.set('No se pudieron cargar las alertas. Comprueba la conexión con la API.'),
    });
    this.http.get<Cargo[]>('/api/loads').subscribe({
      next: (cargos) => this.cargos.set(cargos),
      error: () => this.cargos.set([]),
    });
  }

  protected enterApp(profile: Profile): void {
    this.profile.set(profile);
    this.showCountryMap();
  }

  protected backToWelcome(): void {
    this.profile.set(null);
    this.closeReport();
  }

  protected selectRoute(origin: Location, destination: Location): void {
    this.origin = origin;
    this.destination = destination;
    this.quote.set(null);
    this.showRouteMap();
  }

  protected showCountryMap(): void {
    this.mapMode.set('country');
    this.mapUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl('https://maps.google.com/maps?hl=es&q=Bolivia&z=5&output=embed'),
    );
  }

  protected showRouteMap(): void {
    this.mapMode.set('route');
    const params = new URLSearchParams({
      hl: 'es',
      output: 'embed',
      saddr: `${this.origin}, Bolivia`,
      daddr: `${this.destination}, Bolivia`,
    });
    this.mapUrl.set(
      this.sanitizer.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?${params.toString()}`),
    );
  }

  protected swapLocations(): void {
    [this.origin, this.destination] = [this.destination, this.origin];
    this.quote.set(null);
    if (this.mapMode() === 'route') this.showRouteMap();
  }

  protected routeDistance(origin: Location, destination: Location): string {
    const direct = this.routes().find((route) => route.origin === origin && route.destination === destination);
    if (direct) return `${direct.distance_km} km`;
    const reverse = this.routes().find((route) => route.origin === destination && route.destination === origin);
    if (reverse) return `${reverse.distance_km} km`;
    return '—';
  }

  protected returnCargos(): Cargo[] {
    if (this.profile() !== 'carrier') return this.cargos();
    return this.cargos().filter((cargo) =>
      cargo.origin === this.destination && cargo.destination === this.origin);
  }

  protected requestQuote(): void {
    this.loadingQuote.set(true);
    this.quoteError.set('');
    this.quote.set(null);
    this.http.post<Quote>('/api/quotes', {
      origin: this.origin,
      destination: this.destination,
      fuelConsumptionLPer100Km: Number(this.fuelConsumption),
      ...(this.dieselPrice ? { dieselPriceBobPerLiter: Number(this.dieselPrice) } : {}),
    }).subscribe({
      next: (quote) => {
        this.quote.set(quote);
        this.loadingQuote.set(false);
      },
      error: (error: { status?: number; error?: { error?: string } }) => {
        this.quoteError.set(error.status === 0
          ? 'No se pudo conectar con la API. Inicia el backend en el puerto 3000.'
          : error.status !== undefined && error.status >= 500
            ? 'La API no pudo calcular: verifica MySQL, el esquema de rutas y el precio del diésel en backend/.env.'
            : error.error?.error ?? 'No se pudo calcular la cotización.');
        this.loadingQuote.set(false);
      },
    });
  }

  protected openReport(): void {
    this.reportOpen = true;
    this.reportStatus = '';
    this.reportError = '';
    const route = this.routes().find((item) =>
      item.origin === this.origin && item.destination === this.destination) ?? this.routes()[0];
    this.reportRouteId = route?.id ?? 0;
  }

  protected closeReport(): void {
    this.reportOpen = false;
    this.reportMessage = '';
    this.reportError = '';
  }

  protected submitReport(): void {
    const message = this.reportMessage.trim();
    const route = this.routes().find((item) => item.id === Number(this.reportRouteId));
    if (message.length < 10) {
      this.reportError = 'Describe la novedad con al menos 10 caracteres.';
      return;
    }
    if (!route) {
      this.reportError = 'No hay un tramo catalogado disponible para el reporte.';
      return;
    }
    this.reportSending = true;
    this.reportError = '';
    this.http.post<{ message: string }>('/api/alerts/report', {
      origin: route.origin,
      destination: route.destination,
      message,
    }).subscribe({
      next: (result) => {
        this.reportSending = false;
        this.reportStatus = result.message;
        this.reportMessage = '';
      },
      error: (error: { error?: { error?: string } }) => {
        this.reportSending = false;
        this.reportError = error.error?.error ?? 'No se pudo enviar el reporte. Revisa la conexión con la API.';
      },
    });
  }

  protected sendMessage(): void {
    const message = this.chatInput().trim();
    if (!message || this.chatLoading()) return;
    this.messages.update((items) => [...items, { role: 'user', text: message }]);
    this.chatInput.set('');
    this.chatLoading.set(true);
    this.chatError.set('');
    this.http.post<{ answer: string }>('/api/assistant/chat', { message }).subscribe({
      next: (response) => {
        this.messages.update((items) => [...items, { role: 'assistant', text: response.answer }]);
        this.chatLoading.set(false);
      },
      error: (error: { error?: { error?: string } }) => {
        this.chatError.set(error.error?.error ?? 'No se pudo conectar con el asistente. Verifica Ollama y la API.');
        this.chatLoading.set(false);
      },
    });
  }

  protected formatBob(value: number): string {
    return new Intl.NumberFormat('es-BO', {
      style: 'currency',
      currency: 'BOB',
      maximumFractionDigits: 2,
    }).format(value);
  }

}
