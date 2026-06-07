import Constants from 'expo-constants'

type DataConnectExtra = {
  serviceId?: string
  connectorId?: string
  location?: string
}

const dcExtra = (Constants.expoConfig?.extra?.dataConnect ?? {}) as DataConnectExtra

export const connectorConfig = {
  connector: dcExtra.connectorId ?? 'default',
  service: dcExtra.serviceId ?? 'drivemind',
  location: dcExtra.location ?? 'europe-central2',
}
