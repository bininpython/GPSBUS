# GPS BUS

Aplicação web mobile-first para acompanhar um ônibus e seu trajeto em tempo real.

## Como funciona

- **Motorista:** entra somente com um código numérico de 6 dígitos, liga o ônibus e mantém o GPS ativo durante a viagem.
- **Passageiro:** entra diretamente, sem cadastro ou login, acompanha o ônibus e pode ativar o próprio GPS.
- **Privacidade:** a posição do passageiro existe somente no navegador. Ela não é enviada nem salva no Supabase.
- **Trajeto:** cada posição do ônibus é salva, transmitida pelo Supabase Realtime e desenhada no mapa.
- **Mapa:** MapLibre GL JS com tiles vetoriais do OpenFreeMap, sem chave de API.

## Configuração do Supabase

1. Crie um projeto no Supabase.
2. Abra **SQL Editor**, cole e execute `supabase/schema.sql`.
3. Em **Integrations > Data API > Settings**, confirme que o schema `public` e as tabelas `gps_bus_*` estão expostos à Data API.
4. Abra **Authentication > Users > Add user**.
5. Crie o motorista com o e-mail definido em `VITE_DRIVER_AUTH_EMAIL` e use um código de 6 dígitos como senha. Se necessário, mantenha o comprimento mínimo de senha em 6.
6. Copie o UUID do usuário e execute:

```sql
insert into public.gps_bus_drivers (user_id, bus_label)
values ('UUID_DO_USUARIO_MOTORISTA', 'Linha principal');
```

7. Em **Authentication > Providers > Email**, desative novos cadastros públicos. O app não oferece cadastro.
8. Copie `.env.example` para `.env.local` e preencha os valores.

Nunca coloque `service_role` ou uma secret key no Vite/Vercel. Use somente a chave publicável.

## Variáveis da Vercel

Cadastre em **Project Settings > Environment Variables**:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_DRIVER_AUTH_EMAIL
```

Depois, faça um novo deploy.

## Segurança e privacidade

O código é validado pelo Supabase Auth como senha da conta fixa do motorista. As políticas RLS impedem que usuários não cadastrados em `gps_bus_drivers` publiquem posições. Não existe login de passageiro nem tabela de localização de passageiros.

Um código de 6 dígitos possui menos entropia que uma senha longa. Mantenha as limitações de tentativa do Supabase, ative CAPTCHA se necessário e troque o código periodicamente.

## Desenvolvimento

```bash
npm install
npm run dev
npm run build
```

## Limitação do navegador

Durante a viagem, o motorista deve manter o app aberto e permitir o GPS. Navegadores móveis podem interromper a geolocalização quando a tela é bloqueada ou o app vai para segundo plano. Para rastreamento contínuo em segundo plano, a evolução recomendada é um aplicativo nativo com Capacitor/MapLibre Native.
