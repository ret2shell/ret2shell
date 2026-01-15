{{/*
Expand the name of the chart.
*/}}
{{- define "ret2shell.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "ret2shell.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "ret2shell.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "ret2shell.labels" -}}
helm.sh/chart: {{ include "ret2shell.chart" . }}
{{ include "ret2shell.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "ret2shell.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ret2shell.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "ret2shell.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "ret2shell.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "ret2shell.databaseHost" -}}
{{- if .Values.database.host -}}
{{- .Values.database.host -}}
{{- else if .Values.postgresql.enabled -}}
{{- printf "%s-postgresql" .Release.Name -}}
{{- else -}}
{{- "127.0.0.1" -}}
{{- end -}}
{{- end }}

{{- define "ret2shell.cacheUrl" -}}
{{- if .Values.cache.url -}}
{{- .Values.cache.url -}}
{{- else if .Values.valkey.enabled -}}
{{- printf "redis://%s-valkey:%d" .Release.Name (int .Values.cache.port) -}}
{{- else -}}
{{- printf "redis://127.0.0.1:%d" (int .Values.cache.port) -}}
{{- end -}}
{{- end }}

{{- define "ret2shell.queueHost" -}}
{{- if .Values.queue.host -}}
{{- .Values.queue.host -}}
{{- else if .Values.nats.enabled -}}
{{- printf "%s-nats" .Release.Name -}}
{{- else -}}
{{- "127.0.0.1" -}}
{{- end -}}
{{- end }}

{{- define "ret2shell.victoriaLogsUrl" -}}
{{- if .Values.logging.victoriaUrl -}}
{{- .Values.logging.victoriaUrl -}}
{{- else if .Values.victoriaLogs.enabled -}}
{{- printf "http://%s-victoria-logs-single:9428" .Release.Name -}}
{{- else -}}
{{- "http://127.0.0.1:9428" -}}
{{- end -}}
{{- end }}

{{- define "ret2shell.registryServer" -}}
{{- if .Values.cluster.registry.server -}}
{{- .Values.cluster.registry.server -}}
{{- else if .Values.dockerRegistry.enabled -}}
{{- printf "%s-docker-registry:5000" .Release.Name -}}
{{- else -}}
{{- "" -}}
{{- end -}}
{{- end }}

{{- define "ret2shell.registryExternal" -}}
{{- if .Values.cluster.registry.external -}}
{{- .Values.cluster.registry.external -}}
{{- else -}}
{{- include "ret2shell.registryServer" . -}}
{{- end -}}
{{- end }}
