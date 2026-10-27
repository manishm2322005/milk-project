
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';

const ESP32_IP = '10.132.102.90';

// Configurable project thresholds
const PH_MIN = 6.4;
const PH_MAX = 6.8;

// Target 38.7 C +/- 1 C (project setting)
const TEMP_MIN = 37.7;
const TEMP_MAX = 39.7;

type SensorData = {
  flowDetected: boolean;
  flowStatus: string;
  ph: number | null;
  phRaw: number | null;
  phVoltage: number | null;
  phStatus: string;
  turbidityRaw: number | null;
  temperature: number | null;
  temperatureStatus: string;
};

type Tone = 'good' | 'bad' | 'neutral' | 'warning';

type MetricProps = {
  icon: string;
  title: string;
  value: string;
  unit: string;
  status: string;
  tone: Tone;
  detail?: string;
};

function MetricCard({
  icon,
  title,
  value,
  unit,
  status,
  tone,
  detail,
}: MetricProps) {
  let cardColor = styles.neutralCard;
  let iconColor = styles.neutralIconBox;
  let badgeColor = styles.neutralBadge;
  let textColor = styles.neutralText;

  if (tone === 'good') {
    cardColor = styles.goodCard;
    iconColor = styles.goodIconBox;
    badgeColor = styles.goodBadge;
    textColor = styles.goodText;
  } else if (tone === 'bad') {
    cardColor = styles.badCard;
    iconColor = styles.badIconBox;
    badgeColor = styles.badBadge;
    textColor = styles.badText;
  } else if (tone === 'warning') {
    cardColor = styles.warningCard;
    iconColor = styles.warningIconBox;
    badgeColor = styles.warningBadge;
    textColor = styles.warningText;
  }

  return (
    <View style={[styles.card, cardColor]}>
      <View style={[styles.iconBox, iconColor]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.unit}>{unit}</Text>

        <View style={[styles.statusBadge, badgeColor]}>
          <Text style={[styles.statusText, textColor]}>
            {tone === 'good'
              ? '✓ '
              : tone === 'bad'
              ? '⚠ '
              : '● '}
            {status}
          </Text>
        </View>

        {detail ? (
          <Text style={styles.detail}>{detail}</Text>
        ) : null}
      </View>
    </View>
  );
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

export default function MilkDashboard() {
  const [data, setData] = useState<SensorData | null>(null);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function getReadings() {
      try {
        const url = `http://${ESP32_IP}/data`;

        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }

        const result = await response.json();

        // Check the essential status field before accepting the response.
        if (typeof result.flowDetected !== 'boolean') {
          throw new Error('Invalid ESP32 response');
        }

        const receivedData: SensorData = {
          flowDetected: result.flowDetected,
          flowStatus: String(result.flowStatus ?? 'UNKNOWN'),

          ph: parseNumber(result.ph),
          phRaw: parseNumber(result.phRaw),
          phVoltage: parseNumber(result.phVoltage),
          phStatus: String(result.phStatus ?? 'UNKNOWN'),

          turbidityRaw: parseNumber(result.turbidityRaw),

          temperature: parseNumber(result.temperature),
          temperatureStatus: String(
            result.temperatureStatus ?? 'SENSOR_ERROR'
          ),
        };

        if (active) {
          setData(receivedData);
          setConnected(true);
          setConnectionError('');
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown connection error';

        console.error('ESP32 connection error:', message);

        if (active) {
          setConnected(false);
          setConnectionError(message);
        }
      } finally {
        if (active) {
          setRefreshing(false);
        }
      }
    }

    getReadings();

    const timer = setInterval(getReadings, 2000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [refreshToken]);

  function refreshNow() {
    setRefreshing(true);
    setRefreshToken((previous) => previous + 1);
  }

  function formatValue(
    value: number | null | undefined,
    digits = 2
  ): string {
    return typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(digits)
      : '--';
  }

  // pH status
  const phOK =
    data !== null &&
    data.ph !== null &&
    data.ph >= PH_MIN &&
    data.ph <= PH_MAX &&
    data.phStatus === 'OK';

  const phTone: Tone = !data
    ? 'warning'
    : phOK
    ? 'good'
    : 'bad';

  // Flow status is provided by ESP32 using the turbidity sensor state.
  const flowOK = data !== null && data.flowDetected;

  const flowTone: Tone = !data
    ? 'warning'
    : flowOK
    ? 'good'
    : 'bad';

  // Temperature status
  let temperatureTone: Tone = 'warning';
  let temperatureStatus = 'WAITING FOR DATA';

  if (data) {
    if (data.temperature === null) {
      temperatureTone = 'bad';
      temperatureStatus = 'SENSOR ERROR';
    } else if (
      data.temperature < TEMP_MIN ||
      data.temperatureStatus === 'TEMP_LOW'
    ) {
      temperatureTone = 'bad';
      temperatureStatus = 'TEMPERATURE LOW';
    } else if (
      data.temperature > TEMP_MAX ||
      data.temperatureStatus === 'TEMP_HIGH'
    ) {
      temperatureTone = 'bad';
      temperatureStatus = 'TEMPERATURE HIGH';
    } else if (data.temperatureStatus === 'OK') {
      temperatureTone = 'good';
      temperatureStatus = 'IN RANGE';
    } else {
      temperatureTone = 'bad';
      temperatureStatus = 'CHECK SENSOR';
    }
  }

  // Count only the configured flow, pH and temperature checks.
  const alertCount = data
    ? [
        !flowOK,
        !phOK,
        temperatureTone !== 'good',
      ].filter(Boolean).length
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refreshNow}
        />
      }
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#10213A"
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.topRow}>
          <View style={styles.brandIcon}>
            <Text style={styles.brandEmoji}>🥛</Text>
          </View>

          <View style={styles.brandText}>
            <Text style={styles.eyebrow}>SMART DAIRY SYSTEM</Text>
            <Text style={styles.title}>Milk Quality</Text>
            <Text style={styles.titleSecond}>Monitor</Text>
          </View>
        </View>

        <Text style={styles.headerCaption}>
          Real-time monitoring powered by ESP32
        </Text>

        <View style={styles.connectionRow}>
          <View
            style={[
              styles.connectionDot,
              {
                backgroundColor: connected
                  ? '#4ADE80'
                  : '#F87171',
              },
            ]}
          />

          <Text style={styles.connectionText}>
            {connected
              ? 'ESP32 CONNECTED'
              : 'ESP32 DISCONNECTED'}
          </Text>

          <View style={styles.flexSpace} />

          <Text
            style={[
              styles.liveText,
              {
                color: connected ? '#86EFAC' : '#FCA5A5',
              },
            ]}
          >
            {connected ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>
      </View>

      {/* Dashboard content */}
      <View style={styles.content}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              Monitoring Overview
            </Text>
            <Text style={styles.sectionSubtitle}>
              Automatic update every 2 seconds
            </Text>
          </View>

          <View style={styles.refreshChip}>
            <Text style={styles.refreshChipText}>↻ LIVE</Text>
          </View>
        </View>

        {!data && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color="#2563EB" />

            <Text style={styles.loadingTitle}>
              Connecting to ESP32
            </Text>

            <Text style={styles.loadingText}>
              Check the mobile hotspot, ESP32 IP address,
              and web server.
            </Text>

            {connectionError ? (
              <Text style={styles.errorText}>
                {connectionError}
              </Text>
            ) : null}
          </View>
        )}

        {data && !connected && (
          <View style={styles.offlineNotice}>
            <Text style={styles.noticeTitle}>
              Connection lost
            </Text>

            <Text style={styles.noticeText}>
              Showing the last received values. They may
              be outdated.
            </Text>

            {connectionError ? (
              <Text style={styles.noticeText}>
                Error: {connectionError}
              </Text>
            ) : null}
          </View>
        )}

        {data && (
          <>
            {/* FLOW: Based on turbidity sensor ON/OFF state */}
            <MetricCard
              icon="〰️"
              title="MILK FLOW"
              value={data.flowDetected ? 'FLOW ON' : 'NO FLOW'}
              unit="Status from turbidity sensor"
              status={
                data.flowDetected
                  ? 'FLOW ON'
                  : 'ALERT: NO FLOW'
              }
              tone={flowTone}
              detail="No pulse count displayed"
            />

            {/* pH */}
            <MetricCard
              icon="🧪"
              title="MILK pH LEVEL"
              value={formatValue(data.ph)}
              unit={`Configured range: ${PH_MIN} - ${PH_MAX}`}
              status={
                phOK
                  ? 'IN RANGE'
                  : 'ALERT: OUT OF RANGE'
              }
              tone={phTone}
              detail={
                `Raw ADC: ${formatValue(data.phRaw, 0)} | ` +
                `Voltage: ${formatValue(data.phVoltage, 3)} V`
              }
            />

            {/* TEMPERATURE */}
            <MetricCard
              icon="🌡️"
              title="MILK TEMPERATURE"
              value={
                data.temperature === null
                  ? '-- °C'
                  : `${formatValue(data.temperature)} °C`
              }
              unit={`Configured range: ${TEMP_MIN} - ${TEMP_MAX} °C`}
              status={temperatureStatus}
              tone={temperatureTone}
              detail="DS18B20 temperature probe"
            />

            {/* TURBIDITY */}
            <MetricCard
              icon="💧"
              title="TURBIDITY SENSOR"
              value={formatValue(data.turbidityRaw, 0)}
              unit="Raw analog reading (ADC)"
              status="RAW VALUE"
              tone="neutral"
              detail="ON/OFF state is used for the flow indicator"
            />

            {/* Alert summary */}
            <View style={styles.alertPanel}>
              <View style={styles.alertPanelIcon}>
                <Text style={styles.alertEmoji}>🛡️</Text>
              </View>

              <View style={styles.alertPanelBody}>
                <Text style={styles.alertPanelTitle}>
                  Alert Summary
                </Text>

                <Text style={styles.alertPanelText}>
                  {alertCount === null
                    ? 'Waiting for sensor data.'
                    : alertCount === 0
                    ? 'All configured checks are in range.'
                    : `${alertCount} check(s) need attention.`}
                </Text>
              </View>

              {alertCount !== null && (
                <View
                  style={[
                    styles.alertCount,
                    {
                      backgroundColor:
                        alertCount === 0
                          ? '#DCFCE7'
                          : '#FEE2E2',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontWeight: 'bold',
                      color:
                        alertCount === 0
                          ? '#166534'
                          : '#B91C1C',
                    }}
                  >
                    {alertCount}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* System information */}
        <View style={styles.systemPanel}>
          <Text style={styles.systemTitle}>
            SYSTEM INFORMATION
          </Text>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Controller</Text>
            <Text style={styles.systemValue}>ESP32 DevKit</Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Connection</Text>
            <Text style={styles.systemValue}>
              Mobile hotspot / Wi-Fi
            </Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>ESP32 IP</Text>
            <Text style={styles.systemValue}>{ESP32_IP}</Text>
          </View>

          <View style={styles.systemRow}>
            <Text style={styles.systemLabel}>Last update</Text>
            <Text style={styles.systemValue}>
              {lastUpdated ?? '--'}
            </Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Sensor readings are indicators, not a complete
          milk-safety test. Calibrate the pH sensor and
          validate thresholds before relying on alerts.
        </Text>

        <Text style={styles.footer}>
          MILK QUALITY MONITOR • ESP32 + EXPO
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F3F6FB',
  },

  scrollContent: {
    paddingBottom: 20,
  },

  header: {
    backgroundColor: '#10213A',
    paddingHorizontal: 22,
    paddingTop: 48,
    paddingBottom: 25,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  brandIcon: {
    width: 66,
    height: 66,
    borderRadius: 21,
    backgroundColor: '#243D60',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },

  brandEmoji: {
    fontSize: 34,
  },

  brandText: {
    flex: 1,
  },

  eyebrow: {
    color: '#93C5FD',
    letterSpacing: 2,
    fontSize: 10,
    fontWeight: 'bold',
  },

  title: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },

  titleSecond: {
    fontSize: 27,
    fontWeight: 'bold',
    color: '#7DD3FC',
  },

  headerCaption: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 18,
  },

  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 19,
    backgroundColor: '#1B304D',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },

  connectionDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginRight: 9,
  },

  connectionText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },

  flexSpace: {
    flex: 1,
  },

  liveText: {
    fontSize: 10,
    fontWeight: 'bold',
  },

  content: {
    paddingHorizontal: 17,
    paddingTop: 22,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#142844',
  },

  sectionSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },

  refreshChip: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 20,
  },

  refreshChipText: {
    color: '#1D4ED8',
    fontSize: 10,
    fontWeight: 'bold',
  },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 20,
    marginBottom: 13,
    borderWidth: 1,
  },

  goodCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },

  badCard: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FDA4AF',
  },

  neutralCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },

  warningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
  },

  iconBox: {
    width: 49,
    height: 49,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 13,
  },

  goodIconBox: {
    backgroundColor: '#DCFCE7',
  },

  badIconBox: {
    backgroundColor: '#FFE4E6',
  },

  neutralIconBox: {
    backgroundColor: '#E2E8F0',
  },

  warningIconBox: {
    backgroundColor: '#FEF3C7',
  },

  icon: {
    fontSize: 24,
  },

  cardBody: {
    flex: 1,
  },

  cardTitle: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: 'bold',
    color: '#64748B',
  },

  value: {
    color: '#142844',
    fontSize: 27,
    fontWeight: 'bold',
    marginTop: 5,
  },

  unit: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 11,
  },

  statusText: {
    fontSize: 11,
    fontWeight: 'bold',
  },

  goodBadge: {
    backgroundColor: '#DCFCE7',
  },

  badBadge: {
    backgroundColor: '#FEE2E2',
  },

  neutralBadge: {
    backgroundColor: '#E2E8F0',
  },

  warningBadge: {
    backgroundColor: '#FEF3C7',
  },

  goodText: {
    color: '#166534',
  },

  badText: {
    color: '#B91C1C',
  },

  neutralText: {
    color: '#475569',
  },

  warningText: {
    color: '#92400E',
  },

  detail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 9,
    lineHeight: 16,
  },

  loadingCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 18,
    alignItems: 'center',
    marginBottom: 14,
  },

  loadingTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#142844',
    marginTop: 12,
  },

  loadingText: {
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 7,
  },

  errorText: {
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 12,
    fontSize: 12,
  },

  offlineNotice: {
    backgroundColor: '#FEF3C7',
    padding: 14,
    borderRadius: 13,
    marginBottom: 14,
  },

  noticeTitle: {
    color: '#92400E',
    fontWeight: 'bold',
    marginBottom: 4,
  },

  noticeText: {
    color: '#92400E',
    fontSize: 12,
    lineHeight: 18,
  },

  alertPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  alertPanelIcon: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  alertEmoji: {
    fontSize: 23,
  },

  alertPanelBody: {
    flex: 1,
  },

  alertPanelTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#142844',
  },

  alertPanelText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 4,
  },

  alertCount: {
    minWidth: 33,
    height: 33,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },

  systemPanel: {
    backgroundColor: '#FFFFFF',
    padding: 17,
    borderRadius: 18,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  systemTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    color: '#64748B',
    marginBottom: 12,
  },

  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },

  systemLabel: {
    fontSize: 12,
    color: '#64748B',
  },

  systemValue: {
    fontSize: 12,
    color: '#142844',
    fontWeight: '600',
  },

  disclaimer: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 17,
    marginTop: 18,
    paddingHorizontal: 3,
  },

  footer: {
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 22,
  },
});
