{{- define "ret2shell.requireReleaseNamespace" -}}
{{- if ne .Release.Namespace "ret2shell-platform" -}}
{{- fail "ret2shell chart must be installed into namespace ret2shell-platform" -}}
{{- end -}}
{{- end -}}

{{- define "ret2shell.platformNamespace" -}}
ret2shell-platform
{{- end -}}

{{- define "ret2shell.challengeNamespace" -}}
ret2shell-challenge
{{- end -}}

{{- define "ret2shell.name" -}}
ret2shell
{{- end -}}

{{- define "ret2shell.chart" -}}
{{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "ret2shell.commonLabels" -}}
helm.sh/chart: {{ include "ret2shell.chart" . }}
app.kubernetes.io/name: {{ include "ret2shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "ret2shell.volumeLabels" -}}
app.kubernetes.io/name: {{ include "ret2shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.global.labels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "ret2shell.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ret2shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "ret2shell.componentLabels" -}}
{{ include "ret2shell.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "ret2shell.image" -}}
{{- if .digest -}}
{{- printf "%s@%s" .repository .digest -}}
{{- else -}}
{{- printf "%s:%s" .repository .tag -}}
{{- end -}}
{{- end -}}

{{- define "ret2shell.platformServiceAccountName" -}}
{{- if .Values.platform.serviceAccount.create -}}
{{- default "ret2shell-service" .Values.platform.serviceAccount.name -}}
{{- else -}}
{{- required "platform.serviceAccount.name is required when platform.serviceAccount.create=false" .Values.platform.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "ret2shell.platformName" -}}
ret2shell-platform
{{- end -}}

{{- define "ret2shell.platformHeadlessName" -}}
ret2shell-platform-headless
{{- end -}}

{{- define "ret2shell.platformConfigSecretName" -}}
{{- default "ret2shell-config" .Values.platform.config.existingSecret -}}
{{- end -}}

{{- define "ret2shell.platformBlockedConfigMapName" -}}
{{- default "ret2shell-blocked" .Values.platform.blocked.existingConfigMap -}}
{{- end -}}

{{- define "ret2shell.postgresqlName" -}}
ret2shell-postgresql
{{- end -}}

{{- define "ret2shell.postgresqlHeadlessName" -}}
ret2shell-postgresql-headless
{{- end -}}

{{- define "ret2shell.valkeyName" -}}
ret2shell-valkey
{{- end -}}

{{- define "ret2shell.valkeyHeadlessName" -}}
ret2shell-valkey-headless
{{- end -}}

{{- define "ret2shell.natsName" -}}
ret2shell-nats
{{- end -}}

{{- define "ret2shell.natsHeadlessName" -}}
ret2shell-nats-headless
{{- end -}}

{{- define "ret2shell.registryName" -}}
ret2shell-registry
{{- end -}}

{{- define "ret2shell.victoriaLogsName" -}}
ret2shell-victoria-logs
{{- end -}}

{{- define "ret2shell.victoriaLogsHeadlessName" -}}
ret2shell-victoria-logs-headless
{{- end -}}

{{- define "ret2shell.storageClass" -}}
{{- $root := .root -}}
{{- $local := .local -}}
{{- default $root.Values.global.storageClass $local -}}
{{- end -}}

{{- define "ret2shell.renderAnnotations" -}}
{{- $annotations := . | default dict -}}
{{- if $annotations }}
annotations:
{{ toYaml $annotations }}
{{- end }}
{{- end -}}

{{- define "ret2shell.platformServiceUrl" -}}
{{- printf "http://%s:%d" (include "ret2shell.platformName" .) (int .Values.platform.service.port) -}}
{{- end -}}

{{- define "ret2shell.registryEnabled" -}}
{{- if ne .Values.registry.mode "disabled" -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "ret2shell.victoriaLogsEnabled" -}}
{{- if ne .Values.victoriaLogs.mode "disabled" -}}true{{- else -}}false{{- end -}}
{{- end -}}

{{- define "ret2shell.testImage" -}}
{{ include "ret2shell.image" .Values.global.testImage }}
{{- end -}}
