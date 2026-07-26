package handlers

import (
	"sort"

	"Noooste/garage-ui/internal/authz"
	"Noooste/garage-ui/internal/models"
	"Noooste/garage-ui/internal/services"

	"github.com/gofiber/fiber/v3"
)

type CapabilitiesHandler struct {
	apiVersion           string
	capabilities         services.Capabilities
	accessControlEnabled bool
	deviceAuthEnabled    bool
}

func NewCapabilitiesHandler(apiVersion string, capabilities services.Capabilities, accessControlEnabled bool, deviceAuthEnabled ...bool) *CapabilitiesHandler {
	deviceAuth := true
	if len(deviceAuthEnabled) > 0 {
		deviceAuth = deviceAuthEnabled[0]
	}
	return &CapabilitiesHandler{
		apiVersion:           apiVersion,
		capabilities:         capabilities,
		accessControlEnabled: accessControlEnabled,
		deviceAuthEnabled:    deviceAuth,
	}
}

// GetCapabilities returns Garage feature support and the caller's resolved
// access-control capabilities.
//
//	@Summary		Get client capabilities
//	@Description	Returns API contract metadata, Garage feature support, and the authenticated caller's resolved permissions.
//	@Tags			Capabilities
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	models.APIResponse{data=models.CapabilitiesResponse}
//	@Failure		401	{object}	models.APIResponse
//	@ID				getCapabilities
//	@Router			/api/v1/capabilities [get]
func (h *CapabilitiesHandler) GetCapabilities(c fiber.Ctx) error {
	ac := models.AccessControlCapabilities{Enabled: h.accessControlEnabled}
	if h.accessControlEnabled {
		if subj, ok := authz.SubjectFrom(c); ok {
			ac.Subject = subj.ID
			ac.IsAdmin = subj.IsAdmin
			for _, b := range subj.Bindings {
				ac.Bindings = append(ac.Bindings, models.AccessControlBinding{
					BucketPrefixes: b.BucketPrefixes,
					Permissions:    sortedPerms(b.Permissions),
				})
			}
			ac.ClusterPermissions = sortedPerms(subj.ClusterPerms)
		}
	}
	return c.JSON(models.SuccessResponse(models.CapabilitiesResponse{
		APIVersion:       models.APIContractVersion,
		GarageAPIVersion: h.apiVersion,
		Features: models.CapabilityFeatures{
			ClusterStatistics: h.capabilities.ClusterStatistics,
			NodeInfo:          h.capabilities.NodeInfo,
			NodeStatistics:    h.capabilities.NodeStatistics,
			RefreshTokens:     h.deviceAuthEnabled,
			DeviceSessions:    h.deviceAuthEnabled,
		},
		AccessControl: ac,
	}))
}

func sortedPerms(set authz.PermSet) []string {
	if len(set) == 0 {
		return nil
	}
	out := make([]string, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	sort.Strings(out)
	return out
}
