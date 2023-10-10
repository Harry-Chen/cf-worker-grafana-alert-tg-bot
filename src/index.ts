export interface Env {
  BOT_TOKEN: string;
  TG_CHAT_IDS: string;
  WEBHOOK_TOKEN: string;
}

type StringMap = { [index: string]: string };

// see https://grafana.com/docs/grafana-cloud/alerting-and-irm/alerting/alerting-rules/manage-contact-points/webhook-notifier/
interface GrafanaAlert {
  status: string;
  labels: StringMap;
  annotations: StringMap;
  startsAt: string;
  endsAt: string;
  values: StringMap;
  generatorURL: string;
  fingerprint: string;
  silenceURL: string;
  dashboardURL?: string; // will be deprecated soon
  panelURL?: string; // will be deprecated soon
  imageURL: string;
}

interface GrafanaAlertBody {
  receiver: string;
  status: string;
  orgId: number;
  alerts: GrafanaAlert[];
  groupLabels: StringMap;
  commonLabels: StringMap;
  commonAnnotations: StringMap;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts: number;
  title?: string; // will be deprecated soon
  state?: string; // will be deprecated soon
  message?: string; // will be deprecated soon
}

const getIcon = (status: string) => status === 'resolved' ? '🎉' : '🔥';

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {

    const url = new URL(request.url);
    if (url.pathname !== '/') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response('No token provided', { status: 401 });
    }
    if (authHeader !== `Bearer ${env.WEBHOOK_TOKEN}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    try {
      const bodyText = await request.text();
      console.log(`Received message from Grafana: ${bodyText}`);

      const body = JSON.parse(bodyText) as GrafanaAlertBody;
      const status = body.status;
      var message = `${getIcon(status)} Grafana alert: *${status}*\nSite: ${body.externalURL}\n\n`;

      const ignoreDataSourceError = (url.searchParams.get('ignoreDataSourceError') ?? 'false') === 'true';

      const alertMsgs = body.alerts.map((alert) => {
        const status = alert.status;
        const alertName = alert.labels["alertname"] ?? 'None';
        if (alertName === 'DatasourceError' && ignoreDataSourceError) return null;
        const summary = alert.annotations["summary"];
        const error = alert.annotations["Error"];
        const resolved = status === 'resolved';
        const values = alert.values ? JSON.stringify(alert.values) : '';
        var alertMsg = `${getIcon(status)} Rule \`${alertName}\` changed to *${status}* @ \`${resolved ? alert.endsAt : alert.startsAt}\`: ${summary}`;
        if (values !== '') alertMsg += `\nValues: \`${values}\``;
        if (!resolved && error) alertMsg += `\nError: ${error}`;
        return alertMsg;
      }).filter((alertMsg) => alertMsg !== null);

      if (alertMsgs.length === 0) {
        console.log('No alert messages to send after filtering');
        return new Response('No alert messages to send', { status: 200 });
      } else {
        message += '\n' + alertMsgs.join('\n');
      }

      console.log(`Sending alert message: ${message}`);

      const sendAll = await Promise.allSettled(env.TG_CHAT_IDS.split(',').map(async (chat) => {
        console.log(`Sending message to chat ${chat}`);
        const req = new Request(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            chat_id: parseInt(chat),
            text: message,
            parse_mode: 'Markdown',
          })
        });
        const result = await fetch(req);
        return {
          'headers': result.headers,
          'code': result.status,
          'body': await result.json()
        };
      }));

      const failedReq = sendAll.filter((result) => result.status !== 'fulfilled');
      const results = JSON.stringify(sendAll);
      console.log(`Send message results: ${results}`);

      return new Response(results, { status: failedReq.length > 0 ? 500 : 200 });
    } catch (e) {
      return new Response(JSON.stringify(e), { status: 500 });
    }
  },
};
