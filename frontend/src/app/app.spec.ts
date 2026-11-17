import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('requires a profile choice before showing the dashboard', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpTesting.expectOne('/api/routes').flush([]);
    httpTesting.expectOne('/api/alerts').flush({ alerts: [], liveFeed: false, note: 'Sin feed.' });
    httpTesting.expectOne('/api/loads').flush([]);
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.welcome-screen')).not.toBeNull();
    expect(page.querySelector('.app-shell')).toBeNull();
    expect(page.querySelectorAll('.profile-choice').length).toBe(2);
    expect(page.textContent).toContain('Soy chofer / transportista');
    expect(page.textContent).toContain('Soy generador de carga');
  });

  it('shows Google Maps for Bolivia and renders the fuel cost from a quote', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    httpTesting.expectOne('/api/routes').flush([]);
    httpTesting.expectOne('/api/alerts').flush({ alerts: [], liveFeed: false, note: 'Sin feed.' });
    httpTesting.expectOne('/api/loads').flush([]);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.profile-choice') as HTMLButtonElement).click();
    fixture.detectChanges();

    const map = fixture.nativeElement.querySelector('.google-map') as HTMLIFrameElement;
    expect(map.src).toContain('maps.google.com/maps?hl=es&q=Bolivia&z=5');

    const form = fixture.nativeElement.querySelector('.quote-form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    const quoteRequest = httpTesting.expectOne('/api/quotes');
    quoteRequest.flush({
      origin: 'Cochabamba',
      destination: 'La Paz',
      distanceKm: 444,
      fuelLiters: 177.6,
      fuelCostBob: 710.4,
      tollsBob: null,
      subtotalBob: 710.4,
      complete: false,
      message: 'Estimación preliminar.',
    });
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Costo estimado de combustible');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('710,40');
  });
});
