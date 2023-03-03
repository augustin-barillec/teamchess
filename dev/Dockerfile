ARG PYTHON=3.10

FROM python:${PYTHON} as profile_api_analytics_base


RUN apt-get update \
    && apt-get install --no-install-recommends --assume-yes lsb-release curl less git git-core vim openssh-client unzip \
    software-properties-common && rm -rf /var/lib/apt/*

# create non root user
ENV USERNAME=python
ENV USER_UID=1001
ENV USER_GID=1001

# creating non root user with same UID and GID as your local user (to avoid git issues)
# will work even if your local UID is not 1001 (just need a non root user)
RUN groupadd --gid $USER_GID $USERNAME \
    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    && apt-get update \
    && apt-get install -y sudo \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Install docker to run docker-builder
RUN curl -fsSL https://download.docker.com/linux/$(lsb_release -is | tr '[:upper:]' '[:lower:]')/gpg | apt-key add - 2>/dev/null \
    && echo "deb [arch=amd64] https://download.docker.com/linux/$(lsb_release -is | tr '[:upper:]' '[:lower:]') $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli

# create entrypoint for docker sockets
RUN echo "#!/bin/sh\n\
    sudoIf() { if [ \"\$(id -u)\" -ne 0 ]; then sudo \"\$@\"; else \"\$@\"; fi }\n\
    SOCKET_GID=\$(stat -c '%g' /var/run/docker.sock) \n\
    if [ \"${SOCKET_GID}\" != '0' ]; then\n\
    if [ \"\$(cat /etc/group | grep :\${SOCKET_GID}:)\" = '' ]; then sudoIf groupadd --gid \${SOCKET_GID} docker-host; fi \n\
    if [ \"\$(id ${USERNAME} | grep -E \"groups=.*(=|,)\${SOCKET_GID}\(\")\" = '' ]; then sudoIf usermod -aG \${SOCKET_GID} ${USERNAME}; fi\n\
    fi\n\
    exec \"\$@\"" > /usr/local/share/docker-init.sh \
    && chmod +x /usr/local/share/docker-init.sh

# install gcloud for gcp credentials
RUN echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" | \
    tee -a /etc/apt/sources.list.d/google-cloud-sdk.list && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
    apt-key --keyring /usr/share/keyrings/cloud.google.gpg  add - && apt-get update -y && apt-get install google-cloud-cli -y


# install terraform
ARG TERRAFORM_VERSION=1.3.9
RUN wget https://releases.hashicorp.com/terraform/$TERRAFORM_VERSION/terraform_${TERRAFORM_VERSION}_linux_amd64.zip  \
    && unzip terraform_${TERRAFORM_VERSION}_linux_amd64.zip && mv terraform "/usr/local/bin/" && chmod u+x "/usr/local/bin/terraform" \
    && rm terraform_${TERRAFORM_VERSION}_linux_amd64.zip

# install terraform-docs
ARG TERRAFORM_DOCS_VERSION=0.16.0
RUN curl -Lo ./terraform-docs.tar.gz https://github.com/terraform-docs/terraform-docs/releases/download/v$TERRAFORM_DOCS_VERSION/terraform-docs-v${TERRAFORM_DOCS_VERSION}-$(uname)-amd64.tar.gz \
    && tar -xzf terraform-docs.tar.gz && chmod +x terraform-docs && mv terraform-docs "/usr/local/bin/" \
    && rm terraform-docs.tar.gz

# install terragrunt
ARG TERRAGRUNT_VERSION=0.44.4
RUN wget https://github.com/gruntwork-io/terragrunt/releases/download/v$TERRAGRUNT_VERSION/terragrunt_linux_amd64 \
    && mv terragrunt_linux_amd64 "/usr/local/bin/terragrunt" \
    && chmod u+x "/usr/local/bin/terragrunt"

# install sops
ARG SOPS_VERSION=3.7.3
RUN curl -Lo sops_${SOPS_VERSION}_amd64.deb https://github.com/mozilla/sops/releases/download/v$SOPS_VERSION/sops_${SOPS_VERSION}_amd64.deb \
    && dpkg -i sops_${SOPS_VERSION}_amd64.deb && rm sops_${SOPS_VERSION}_amd64.deb

# VS Code overrides ENTRYPOINT and CMD when executing `docker run` by default.
# Setting the ENTRYPOINT to docker-init.sh will configure non-root access to
# the Docker socket if "overrideCommand": false is set in devcontainer.json.
# The script will also execute CMD if you need to alter startup behaviors.
ENTRYPOINT [ "/usr/local/share/docker-init.sh" ]
CMD [ "sleep", "infinity" ]