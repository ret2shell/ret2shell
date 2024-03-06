# Kubernetes Deployment

This directory contains the Kubernetes deployment files for the application.

Deploy these files in the following order:

1. `00-challenge-namespace.opt.yaml`: (Optional) create the namespace for challenge environments. Ret2Shell will automatically create this if it does not exist, if you are afraid to grant the `namepspaces` permissions to Ret2Shell, you can create it manually and disable the k8s auto migration feature in Ret2Shell.
2. `00-platform-namespace.yaml`: Create the namespace for Ret2Shell.
3. `01-platform-role.yaml`: Create the cluster role for Ret2Shell. The default role definition maybe too weak, you can modify this file to restrict it according to your needs.
4. `02-platform-serviceaccount.yaml`: Create the service account for Ret2Shell.
5. `03-platform-rolebinding.yaml`: Create the role binding for Ret2Shell.
