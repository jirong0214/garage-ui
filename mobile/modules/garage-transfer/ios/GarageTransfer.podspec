Pod::Spec.new do |s|
  s.name           = 'GarageTransfer'
  s.version        = '1.0.0'
  s.summary        = 'Garage UI background transfer support'
  s.description    = 'Background URLSession downloads for the Garage UI mobile app.'
  s.author         = 'Garage UI'
  s.homepage       = 'https://github.com/jirong0214/garage-ui'
  s.platforms      = {
    :ios => '17.0'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
